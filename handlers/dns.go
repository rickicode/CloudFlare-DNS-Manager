package handlers

import (
	"context"
	"fmt"
	"strings"

	"github.com/cloudflare/cloudflare-go"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/session"
)

// DNSRecord represents a DNS record in a simplified format
type DNSRecord struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Name    string `json:"name"`
	Content string `json:"content"`
	TTL     int    `json:"ttl"`
	Proxied bool   `json:"proxied"`
}

// DNSRecordInput represents the user input format for DNS records
type DNSRecordInput struct {
	Records string `json:"records"`
}

// DNSRecordUpdateRequest represents a single DNS record update request
type DNSRecordUpdateRequest struct {
	Type    string `json:"type"`    // A, CNAME, etc.
	Name    string `json:"name"`    // Subdomain or @ for root
	Content string `json:"content"` // IP or target domain
}

// GetDNSRecordsHandler retrieves DNS records for a domain
func GetDNSRecordsHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		domainName := c.Params("domain")
		if domainName == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Domain name is required",
			})
		}

		// Get API client from session
		api, err := GetAPIClient(c, store)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "API client error",
				"error":   err.Error(),
			})
		}

		// Get zone ID
		zoneID, err := api.ZoneIDByName(domainName)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"success": false,
				"message": "Domain not found",
				"error":   err.Error(),
			})
		}

		// Parse pagination parameters
		page := c.QueryInt("page", 1)
		perPage := c.QueryInt("per_page", 20) // Default 20 records per page
		search := c.Query("search", "")       // Search query
		recordType := c.Query("type", "")     // Record type filter

		// Limit per_page to reasonable values
		if perPage > 100 {
			perPage = 100
		}
		if perPage < 1 {
			perPage = 20
		}
		if page < 1 {
			page = 1
		}

		// Build ListDNSRecordsParams with type filter only
		listParams := cloudflare.ListDNSRecordsParams{}

		// Add type filter if provided (this can be applied at API level)
		if recordType != "" {
			listParams.Type = recordType
		}

		// Get all DNS records first (Cloudflare API doesn't support pagination for DNS records in the same way)
		// Note: We don't apply search filter here because Cloudflare's Name parameter requires exact match
		records, _, err := api.ListDNSRecords(context.Background(), cloudflare.ZoneIdentifier(zoneID), listParams)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to fetch DNS records",
				"error":   err.Error(),
			})
		}

		// Convert to our simplified model
		allDNSRecords := make([]DNSRecord, 0, len(records))
		for _, record := range records {
			// Handle the pointer to bool
			proxiedValue := false
			if record.Proxied != nil {
				proxiedValue = *record.Proxied
			}

			allDNSRecords = append(allDNSRecords, DNSRecord{
				ID:      record.ID,
				Type:    record.Type,
				Name:    record.Name,
				Content: record.Content,
				TTL:     record.TTL,
				Proxied: proxiedValue,
			})
		}

		// Apply search filter client-side if provided (similar to domains.go implementation)
		if search != "" {
			filteredRecords := []DNSRecord{}
			searchLower := strings.ToLower(search)
			for _, record := range allDNSRecords {
				// Search in name and content fields for partial matches
				if strings.Contains(strings.ToLower(record.Name), searchLower) ||
					strings.Contains(strings.ToLower(record.Content), searchLower) {
					filteredRecords = append(filteredRecords, record)
				}
			}
			allDNSRecords = filteredRecords
		}

		// Implement pagination manually
		totalCount := len(allDNSRecords)
		totalPages := (totalCount + perPage - 1) / perPage

		// Calculate start and end indices
		startIndex := (page - 1) * perPage
		endIndex := startIndex + perPage

		if startIndex >= totalCount {
			startIndex = 0
			endIndex = 0
		} else if endIndex > totalCount {
			endIndex = totalCount
		}

		// Get the paginated slice
		paginatedRecords := []DNSRecord{}
		if startIndex < endIndex {
			paginatedRecords = allDNSRecords[startIndex:endIndex]
		}

		// Build pagination info
		pagination := map[string]interface{}{
			"page":        page,
			"per_page":    perPage,
			"total_count": totalCount,
			"total_pages": totalPages,
		}

		return c.JSON(fiber.Map{
			"success":    true,
			"data":       paginatedRecords,
			"pagination": pagination,
		})
	}
}

// RenderDNSPageHandler renders the DNS management page for a domain
func RenderDNSPageHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		domainName := c.Params("domain")
		if domainName == "" {
			return c.Redirect("/domains")
		}

		// Check if API is valid
		sess, err := store.Get(c)
		if err != nil {
			return c.Redirect("/")
		}

		valid := sess.Get(KeyAPIValid)
		if valid == nil || !valid.(bool) {
			return c.Redirect("/")
		}

		// Get email from session
		email := sess.Get("apiEmail")
		emailStr := ""
		if email != nil {
			emailStr = email.(string)
		}

		return c.Render("dns", fiber.Map{
			"Domain": domainName,
			"Email":  emailStr,
		})
	}
}

// EditDNSRecordHandler handles editing an existing DNS record
func EditDNSRecordHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		domainName := c.Params("domain")
		recordID := c.Params("id")

		if domainName == "" || recordID == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Domain name and record ID are required",
			})
		}

		// Parse the request body
		type EditRecordRequest struct {
			Type    string `json:"type"`
			Name    string `json:"name"`
			Content string `json:"content"`
			Proxied bool   `json:"proxied"`
		}

		req := new(EditRecordRequest)
		if err := c.BodyParser(req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Invalid request format",
				"error":   err.Error(),
			})
		}

		// Get API client from session
		api, err := GetAPIClient(c, store)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "API client error",
				"error":   err.Error(),
			})
		}

		// Get zone ID
		zoneID, err := api.ZoneIDByName(domainName)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"success": false,
				"message": "Domain not found",
				"error":   err.Error(),
			})
		}

		// Prepare record data
		recordName := req.Name
		if recordName == "@" {
			recordName = domainName
		} else if !strings.Contains(recordName, domainName) {
			recordName = recordName + "." + domainName
		}

		// Handle @ symbol in CONTENT field
		recordContent := req.Content
		if recordContent == "@" {
			recordContent = domainName
		}

		// For A records where CONTENT is @, we need to look up the IP of the root domain
		if req.Type == "A" && recordContent == domainName {
			// Get the A records for the root domain
			rootRecords, _, err := api.ListDNSRecords(
				context.Background(),
				cloudflare.ZoneIdentifier(zoneID),
				cloudflare.ListDNSRecordsParams{
					Type: "A",
					Name: domainName,
				},
			)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"success": false,
					"message": "Failed to get IP address for root domain",
					"error":   err.Error(),
				})
			}

			// Check if we found any A records
			if len(rootRecords) == 0 {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"success": false,
					"message": "No A record found for root domain. Cannot use @ in CONTENT for A record.",
				})
			}

			// Use the IP address from the first A record
			recordContent = rootRecords[0].Content
		}

		proxied := req.Proxied

		// Update record
		params := cloudflare.UpdateDNSRecordParams{
			ID:      recordID,
			Type:    req.Type,
			Name:    recordName,
			Content: recordContent,
			Proxied: &proxied,
			TTL:     1, // Auto TTL
		}

		record, err := api.UpdateDNSRecord(context.Background(), cloudflare.ZoneIdentifier(zoneID), params)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to update DNS record",
				"error":   err.Error(),
			})
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": fmt.Sprintf("Updated %s record: %s", req.Type, recordName),
			"record":  record,
		})
	}
}

// BulkDeleteDNSRecordsHandler handles bulk deletion of DNS records
func BulkDeleteDNSRecordsHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		domainName := c.Params("domain")
		if domainName == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Domain name is required",
			})
		}

		// Parse request body
		var req struct {
			RecordIDs []string `json:"record_ids"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Invalid request format",
				"error":   err.Error(),
			})
		}

		if len(req.RecordIDs) == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "No records specified for deletion",
			})
		}

		// Get API client from session
		api, err := GetAPIClient(c, store)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "API client error",
				"error":   err.Error(),
			})
		}

		// Get zone ID
		zoneID, err := api.ZoneIDByName(domainName)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"success": false,
				"message": "Domain not found",
				"error":   err.Error(),
			})
		}

		// Delete records
		results := make([]map[string]interface{}, 0, len(req.RecordIDs))
		successCount := 0

		for _, recordID := range req.RecordIDs {
			err := api.DeleteDNSRecord(context.Background(), cloudflare.ZoneIdentifier(zoneID), recordID)
			if err != nil {
				// Check if error is "record doesn't exist" - treat as success since it's already gone
				errorStr := err.Error()
				if strings.Contains(errorStr, "Record does not exist") || strings.Contains(errorStr, "81044") {
					results = append(results, map[string]interface{}{
						"record_id": recordID,
						"success":   true,
						"note":      "Record already deleted",
					})
					successCount++
				} else {
					results = append(results, map[string]interface{}{
						"record_id": recordID,
						"success":   false,
						"error":     errorStr,
					})
				}
			} else {
				results = append(results, map[string]interface{}{
					"record_id": recordID,
					"success":   true,
				})
				successCount++
			}
		}

		return c.JSON(fiber.Map{
			"success":       successCount > 0,
			"message":       fmt.Sprintf("Deleted %d of %d records", successCount, len(req.RecordIDs)),
			"results":       results,
			"success_count": successCount,
			"total_count":   len(req.RecordIDs),
		})
	}
}

// DeleteDNSRecordHandler handles deleting a DNS record
func DeleteDNSRecordHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		domainName := c.Params("domain")
		recordID := c.Params("id")

		if domainName == "" || recordID == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Domain name and record ID are required",
			})
		}

		// Get API client from session
		api, err := GetAPIClient(c, store)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "API client error",
				"error":   err.Error(),
			})
		}

		// Get zone ID
		zoneID, err := api.ZoneIDByName(domainName)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"success": false,
				"message": "Domain not found",
				"error":   err.Error(),
			})
		}

		// Delete the record
		err = api.DeleteDNSRecord(context.Background(), cloudflare.ZoneIdentifier(zoneID), recordID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to delete DNS record",
				"error":   err.Error(),
			})
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": "DNS record deleted successfully",
		})
	}
}

// UpdateDNSRecordsHandler handles batch updating of DNS records
func UpdateDNSRecordsHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		domainName := c.Params("domain")
		if domainName == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Domain name is required",
			})
		}

		// Parse input
		input := new(DNSRecordInput)
		if err := c.BodyParser(input); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Invalid request format",
				"error":   err.Error(),
			})
		}

		// Get API client from session
		api, err := GetAPIClient(c, store)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "API client error",
				"error":   err.Error(),
			})
		}

		// Get zone ID
		zoneID, err := api.ZoneIDByName(domainName)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"success": false,
				"message": "Domain not found",
				"error":   err.Error(),
			})
		}

		// Process records
		lines := strings.Split(input.Records, "\n")
		results := make([]map[string]interface{}, 0, len(lines))

		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}

			// Parse line: TYPE|NAME|CONTENT|PROXIED (PROXIED is optional, defaults to true)
			parts := strings.Split(line, "|")
			if len(parts) < 3 || len(parts) > 4 {
				results = append(results, map[string]interface{}{
					"success": false,
					"line":    line,
					"message": "Invalid format, expected TYPE|NAME|CONTENT or TYPE|NAME|CONTENT|PROXIED",
				})
				continue
			}

			recordType := strings.TrimSpace(parts[0])
			recordName := strings.TrimSpace(parts[1])
			recordContent := strings.TrimSpace(parts[2])

			// Parse proxied value (default to true if not specified)
			proxiedStr := "true"
			if len(parts) == 4 {
				proxiedStr = strings.TrimSpace(parts[3])
			}

			// Validate record type
			validTypes := []string{"A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"}
			isValidType := false
			for _, validType := range validTypes {
				if recordType == validType {
					isValidType = true
					break
				}
			}

			if !isValidType {
				results = append(results, map[string]interface{}{
					"success": false,
					"line":    line,
					"message": fmt.Sprintf("Invalid record type: %s. Supported types: A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, PTR", recordType),
				})
				continue
			}

			// Add special handling for MX records, which require priority
			if recordType == "MX" {
				// Content format for MX should be "priority content" like "10 mail.example.com"
				if !strings.Contains(recordContent, " ") {
					results = append(results, map[string]interface{}{
						"success": false,
						"line":    line,
						"message": "MX record content must include priority (e.g., '10 mail.example.com')",
					})
					continue
				}
			}

			// Handle @ symbol for root domain in NAME field
			if recordName == "@" {
				recordName = domainName
			} else if !strings.Contains(recordName, domainName) {
				// If not already FQDN, append the domain name
				recordName = recordName + "." + domainName
			}

			// Handle @ symbol in CONTENT field
			if recordContent == "@" {
				// If content is @, it means the root domain
				recordContent = domainName
			}

			// For A records where CONTENT is @, we need to look up the IP of the root domain
			if recordType == "A" && recordContent == domainName {
				// Get the A records for the root domain
				rootRecords, _, err := api.ListDNSRecords(
					context.Background(),
					cloudflare.ZoneIdentifier(zoneID),
					cloudflare.ListDNSRecordsParams{
						Type: "A",
						Name: domainName,
					},
				)
				if err != nil {
					results = append(results, map[string]interface{}{
						"success": false,
						"line":    line,
						"message": "Failed to get IP address for root domain",
						"error":   err.Error(),
					})
					continue
				}

				// Check if we found any A records
				if len(rootRecords) == 0 {
					results = append(results, map[string]interface{}{
						"success": false,
						"line":    line,
						"message": "No A record found for root domain. Cannot use @ in CONTENT for A record.",
					})
					continue
				}

				// Use the IP address from the first A record
				recordContent = rootRecords[0].Content
			}

			// Parse the proxied value
			proxied := false
			if proxiedStr == "true" || proxiedStr == "1" || proxiedStr == "yes" {
				proxied = true
			} else if proxiedStr == "false" || proxiedStr == "0" || proxiedStr == "no" {
				proxied = false
			} else {
				results = append(results, map[string]interface{}{
					"success": false,
					"line":    line,
					"message": "Invalid proxied value. Use 'true' or 'false'",
				})
				continue
			}

			// Check if any records with the same name and type exist
			existingRecords, _, err := api.ListDNSRecords(
				context.Background(),
				cloudflare.ZoneIdentifier(zoneID),
				cloudflare.ListDNSRecordsParams{
					Name: recordName,
					Type: recordType,
				},
			)

			if err != nil {
				results = append(results, map[string]interface{}{
					"success": false,
					"line":    line,
					"message": "Failed to check existing records",
					"error":   err.Error(),
				})
				continue
			}

			// If records with the same name and type exist, delete them first
			if len(existingRecords) > 0 {
				deletedCount := 0
				for _, existingRecord := range existingRecords {
					err = api.DeleteDNSRecord(context.Background(), cloudflare.ZoneIdentifier(zoneID), existingRecord.ID)
					if err != nil {
						// Log the error but continue with other deletions
						results = append(results, map[string]interface{}{
							"success": false,
							"line":    line,
							"message": fmt.Sprintf("Failed to delete existing %s record %s", recordType, existingRecord.ID),
							"error":   err.Error(),
						})
					} else {
						deletedCount++
					}
				}

				// Only proceed to create new record if all deletions were successful
				if deletedCount != len(existingRecords) {
					continue
				}
			}

			// Create the new record
			recordParams := cloudflare.CreateDNSRecordParams{
				Type:    recordType,
				Name:    recordName,
				Content: recordContent,
				TTL:     1, // Auto TTL
				Proxied: &proxied,
			}

			response, err := api.CreateDNSRecord(context.Background(), cloudflare.ZoneIdentifier(zoneID), recordParams)
			if err != nil {
				results = append(results, map[string]interface{}{
					"success": false,
					"line":    line,
					"message": "Failed to create DNS record",
					"error":   err.Error(),
				})
				continue
			}

			// Determine appropriate message based on whether we replaced existing records
			var message string
			if len(existingRecords) > 0 {
				if len(existingRecords) == 1 {
					message = fmt.Sprintf("🔄 Replaced %s record: %s → %s (proxied: %t)", recordType, recordName, recordContent, proxied)
				} else {
					message = fmt.Sprintf("🔄 Replaced %d %s records with: %s → %s (proxied: %t)", len(existingRecords), recordType, recordName, recordContent, proxied)
				}
			} else {
				message = fmt.Sprintf("➕ Created %s record: %s → %s (proxied: %t)", recordType, recordName, recordContent, proxied)
			}

			results = append(results, map[string]interface{}{
				"success":        true,
				"line":           line,
				"message":        message,
				"id":             response.ID,
				"created":        len(existingRecords) == 0,
				"replaced":       len(existingRecords) > 0,
				"replaced_count": len(existingRecords),
				"record": map[string]interface{}{
					"type":    recordType,
					"name":    recordName,
					"content": recordContent,
					"proxied": proxied,
				},
			})
		}

		// Count successful operations
		successCount := 0
		for _, result := range results {
			if success, ok := result["success"].(bool); ok && success {
				successCount++
			}
		}

		// Generate summary message with more detail
		totalCount := len(results)
		message := ""
		if totalCount == 0 {
			message = "No DNS records to process"
		} else if successCount == totalCount {
			if totalCount == 1 {
				message = "✅ Successfully processed 1 DNS record"
			} else {
				message = fmt.Sprintf("✅ Successfully processed all %d DNS records", totalCount)
			}
		} else if successCount == 0 {
			message = fmt.Sprintf("❌ Failed to process all %d DNS records", totalCount)
		} else {
			message = fmt.Sprintf("⚠️ Processed %d of %d DNS records successfully (%d failed)", successCount, totalCount, totalCount-successCount)
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": message,
			"results": results,
		})
	}
}

// CreateDNSRecordHandler handles creating a single DNS record
func CreateDNSRecordHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		domainName := c.Params("domain")
		if domainName == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Domain name is required",
			})
		}

		// Parse the request body
		type CreateRecordRequest struct {
			Type    string `json:"type"`
			Name    string `json:"name"`
			Content string `json:"content"`
			Proxied bool   `json:"proxied"`
		}

		req := new(CreateRecordRequest)
		if err := c.BodyParser(req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Invalid request format",
				"error":   err.Error(),
			})
		}

		// Get API client from session
		api, err := GetAPIClient(c, store)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "API client error",
				"error":   err.Error(),
			})
		}

		// Get zone ID
		zoneID, err := api.ZoneIDByName(domainName)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"success": false,
				"message": "Domain not found",
				"error":   err.Error(),
			})
		}

		// Prepare record data
		recordName := req.Name
		if recordName == "@" {
			recordName = domainName
		} else if !strings.Contains(recordName, domainName) {
			recordName = recordName + "." + domainName
		}

		// Handle @ symbol in CONTENT field
		recordContent := req.Content
		if recordContent == "@" {
			recordContent = domainName
		}

		// For A records where CONTENT is @, we need to look up the IP of the root domain
		if req.Type == "A" && recordContent == domainName {
			// Get the A records for the root domain
			rootRecords, _, err := api.ListDNSRecords(
				context.Background(),
				cloudflare.ZoneIdentifier(zoneID),
				cloudflare.ListDNSRecordsParams{
					Type: "A",
					Name: domainName,
				},
			)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"success": false,
					"message": "Failed to get IP address for root domain",
					"error":   err.Error(),
				})
			}

			// Check if we found any A records
			if len(rootRecords) == 0 {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"success": false,
					"message": "No A record found for root domain. Cannot use @ in CONTENT for A record.",
				})
			}

			// Use the IP address from the first A record
			recordContent = rootRecords[0].Content
		}

		proxied := req.Proxied

		// Create record
		params := cloudflare.CreateDNSRecordParams{
			Type:    req.Type,
			Name:    recordName,
			Content: recordContent,
			Proxied: &proxied,
			TTL:     1, // Auto TTL
		}

		record, err := api.CreateDNSRecord(context.Background(), cloudflare.ZoneIdentifier(zoneID), params)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to create DNS record",
				"error":   err.Error(),
			})
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": fmt.Sprintf("✅ Created %s record: %s → %s (proxied: %t)", req.Type, recordName, recordContent, proxied),
			"record": map[string]interface{}{
				"id":      record.ID,
				"type":    record.Type,
				"name":    record.Name,
				"content": record.Content,
				"proxied": record.Proxied != nil && *record.Proxied,
			},
		})
	}
}
