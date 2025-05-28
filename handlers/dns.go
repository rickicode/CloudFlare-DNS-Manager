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

		// Get DNS records
		records, _, err := api.ListDNSRecords(context.Background(), cloudflare.ZoneIdentifier(zoneID), cloudflare.ListDNSRecordsParams{})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to fetch DNS records",
				"error":   err.Error(),
			})
		}

		// Convert to our simplified model
		dnsRecords := make([]DNSRecord, 0, len(records))
		for _, record := range records {
			// Handle the pointer to bool
			proxiedValue := false
			if record.Proxied != nil {
				proxiedValue = *record.Proxied
			}

			dnsRecords = append(dnsRecords, DNSRecord{
				ID:      record.ID,
				Type:    record.Type,
				Name:    record.Name,
				Content: record.Content,
				TTL:     record.TTL,
				Proxied: proxiedValue,
			})
		}

		return c.JSON(fiber.Map{
			"success": true,
			"data":    dnsRecords,
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

		return c.Render("dns", fiber.Map{
			"Domain": domainName,
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

			// Parse line: TYPE|NAME|CONTENT
			parts := strings.Split(line, "|")
			if len(parts) != 3 {
				results = append(results, map[string]interface{}{
					"success": false,
					"line":    line,
					"message": "Invalid format, expected TYPE|NAME|CONTENT",
				})
				continue
			}

			recordType := strings.TrimSpace(parts[0])
			recordName := strings.TrimSpace(parts[1])
			recordContent := strings.TrimSpace(parts[2])

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

			// Prepare the proxied value as pointer
			proxied := true

			// First check if ANY record with the same name exists (regardless of type)
			existingRecords, _, err := api.ListDNSRecords(
				context.Background(),
				cloudflare.ZoneIdentifier(zoneID),
				cloudflare.ListDNSRecordsParams{
					Name: recordName,
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

			// Check if we have an existing record with the same name
			if len(existingRecords) > 0 {
				var matchingTypeRecord *cloudflare.DNSRecord
				var sameNameRecord *cloudflare.DNSRecord

				// Find if there's a record with the same name AND type, or just same name
				for i, record := range existingRecords {
					if record.Name == recordName {
						sameNameRecord = &existingRecords[i]
						if record.Type == recordType {
							matchingTypeRecord = &existingRecords[i]
							break
						}
					}
				}

				// Case 1: Record with same name and type exists - update it
				if matchingTypeRecord != nil {
					// Update the record
					updateParams := cloudflare.UpdateDNSRecordParams{
						ID:      matchingTypeRecord.ID,
						Type:    recordType,
						Name:    recordName,
						Content: recordContent,
						Proxied: &proxied,
						TTL:     1, // Auto TTL
					}

					record, err := api.UpdateDNSRecord(context.Background(), cloudflare.ZoneIdentifier(zoneID), updateParams)
					if err != nil {
						results = append(results, map[string]interface{}{
							"success": false,
							"line":    line,
							"message": "Failed to update DNS record",
							"error":   err.Error(),
						})
						continue
					}

					results = append(results, map[string]interface{}{
						"success": true,
						"line":    line,
						"message": fmt.Sprintf("Updated %s record for %s", recordType, recordName),
						"id":      record.ID,
						"updated": true,
					})
				} else if sameNameRecord != nil {
					// Case 2: Record with same name but different type exists - delete and recreate
					// Delete the existing record
					err = api.DeleteDNSRecord(context.Background(), cloudflare.ZoneIdentifier(zoneID), sameNameRecord.ID)
					if err != nil {
						results = append(results, map[string]interface{}{
							"success": false,
							"line":    line,
							"message": fmt.Sprintf("Failed to delete existing %s record before creating %s record", sameNameRecord.Type, recordType),
							"error":   err.Error(),
						})
						continue
					}

					// Create a new record with the desired type
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
							"message": "Failed to create DNS record after deleting old record",
							"error":   err.Error(),
						})
						continue
					}

					results = append(results, map[string]interface{}{
						"success":     true,
						"line":        line,
						"message":     fmt.Sprintf("Changed record type from %s to %s for %s", sameNameRecord.Type, recordType, recordName),
						"id":          response.ID,
						"updated":     true,
						"typeChanged": true,
					})
				}
			} else {
				// Case 3: No record with this name exists - create new
				recordParams := cloudflare.CreateDNSRecordParams{
					Type:    recordType,
					Name:    recordName,
					Content: recordContent,
					TTL:     1, // Auto TTL
					Proxied: &proxied,
				}

				// Create the record
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

				results = append(results, map[string]interface{}{
					"success": true,
					"line":    line,
					"message": fmt.Sprintf("Created %s record for %s", recordType, recordName),
					"id":      response.ID,
					"created": true,
				})
			}
		}

		return c.JSON(fiber.Map{
			"success": true,
			"results": results,
		})
	}
}
