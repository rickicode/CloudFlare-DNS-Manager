package handlers

import (
	"context"
	"fmt"
	"strings"

	"github.com/cloudflare/cloudflare-go"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/session"
)

// Domain represents a Cloudflare domain
type Domain struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	CreatedOn string `json:"created_on"`
}

// DomainsHandler handles fetching domains from Cloudflare with pagination
func DomainsHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get API client from session
		api, err := GetAPIClient(c, store)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "API client error",
				"error":   err.Error(),
			})
		}

		// Parse pagination parameters
		page := c.QueryInt("page", 1)
		perPage := c.QueryInt("per_page", 20) // Default 20 domains per page to match Cloudflare
		search := c.Query("search", "")       // Search query

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

		// Get zones (domains) from Cloudflare
		zones, err := api.ListZones(context.Background())
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to fetch domains",
				"error":   err.Error(),
			})
		}

		// Apply search filter if provided
		if search != "" {
			filteredZones := []cloudflare.Zone{}
			searchLower := strings.ToLower(search)
			for _, zone := range zones {
				if strings.Contains(strings.ToLower(zone.Name), searchLower) {
					filteredZones = append(filteredZones, zone)
				}
			}
			zones = filteredZones
		}

		// Calculate pagination
		totalCount := len(zones)
		totalPages := (totalCount + perPage - 1) / perPage

		// Apply pagination
		startIndex := (page - 1) * perPage
		endIndex := startIndex + perPage

		if startIndex > totalCount {
			zones = []cloudflare.Zone{}
		} else {
			if endIndex > totalCount {
				endIndex = totalCount
			}
			zones = zones[startIndex:endIndex]
		}

		// Convert zones to Domain objects
		domains := make([]Domain, len(zones))
		for i, zone := range zones {
			createdOn := ""
			if !zone.CreatedOn.IsZero() {
				createdOn = zone.CreatedOn.Format("2006-01-02T15:04:05Z")
			}

			domains[i] = Domain{
				ID:        zone.ID,
				Name:      zone.Name,
				Status:    zone.Status,
				CreatedOn: createdOn,
			}
		}

		// Return paginated response
		return c.JSON(fiber.Map{
			"success": true,
			"data":    domains,
			"pagination": fiber.Map{
				"page":        page,
				"per_page":    perPage,
				"total_count": totalCount,
				"total_pages": totalPages,
			},
		})
	}
}

// RenderDomainsPageHandler handles rendering the domains page
func RenderDomainsPageHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
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

		return c.Render("domains", fiber.Map{
			"Email": emailStr,
		})
	}
}

// AddDomainsRequest represents the request for adding multiple domains
type AddDomainsRequest struct {
	Domains         string   `json:"domains"`         // Newline-separated domain names
	Template        string   `json:"template"`        // Template ID
	TemplateRecords []string `json:"templateRecords"` // DNS records from template
}

// AddDomainsResponse represents the response for domain addition results
type AddDomainsResponse struct {
	Success bool              `json:"success"`
	Results []DomainAddResult `json:"results"`
	Message string            `json:"message"`
}

// DomainAddResult represents the result of adding a single domain
type DomainAddResult struct {
	Domain       string   `json:"domain"`
	Success      bool     `json:"success"`
	Message      string   `json:"message"`
	Error        string   `json:"error,omitempty"`
	Nameservers  []string `json:"nameservers,omitempty"`
	ZoneID       string   `json:"zone_id,omitempty"`
	DNSRecords   int      `json:"dns_records,omitempty"`   // Number of DNS records added
	DNSErrors    []string `json:"dns_errors,omitempty"`    // DNS record creation errors
	TemplateName string   `json:"template_name,omitempty"` // Template used
}

// AddDomainsHandler handles adding multiple domains to Cloudflare
func AddDomainsHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get API client from session
		api, err := GetAPIClient(c, store)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "API client error",
				"error":   err.Error(),
			})
		}

		// Parse request
		req := new(AddDomainsRequest)
		if err := c.BodyParser(req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Invalid request format",
				"error":   err.Error(),
			})
		}

		// Parse domains from the request
		domains := parseDomainsList(req.Domains)
		if len(domains) == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "No valid domains provided",
			})
		}

		// Process each domain
		results := make([]DomainAddResult, 0, len(domains))
		successCount := 0

		for _, domain := range domains {
			result := addSingleDomain(api, domain, req.TemplateRecords, req.Template)
			results = append(results, result)
			if result.Success {
				successCount++
			}
		}

		// Return results
		message := fmt.Sprintf("Successfully added %d out of %d domains", successCount, len(domains))

		return c.JSON(AddDomainsResponse{
			Success: true,
			Results: results,
			Message: message,
		})
	}
}

// parseDomainsList parses the domains string into a slice of domain names
func parseDomainsList(domainsText string) []string {
	lines := strings.Split(domainsText, "\n")
	domains := make([]string, 0)

	for _, line := range lines {
		domain := strings.TrimSpace(line)
		if domain != "" && isValidDomain(domain) {
			domains = append(domains, domain)
		}
	}

	return domains
}

// isValidDomain performs basic domain validation
func isValidDomain(domain string) bool {
	// Basic validation - domain should contain at least one dot and be at least 3 characters
	return len(domain) >= 3 && strings.Contains(domain, ".") && !strings.HasPrefix(domain, ".") && !strings.HasSuffix(domain, ".")
}

// addSingleDomain adds a single domain to Cloudflare and returns the result
func addSingleDomain(api *cloudflare.API, domain string, templateRecords []string, templateName string) DomainAddResult {
	result := DomainAddResult{
		Domain:  domain,
		Success: false,
	}

	if templateName != "" {
		result.TemplateName = templateName
	}

	// Create zone in Cloudflare
	zone, err := api.CreateZone(context.Background(), domain, false, cloudflare.Account{}, "full")
	if err != nil {
		result.Error = err.Error()
		result.Message = fmt.Sprintf("Failed to add domain: %s", err.Error())
		return result
	}

	// Get nameservers for the zone
	zoneDetails, err := api.ZoneDetails(context.Background(), zone.ID)
	if err != nil {
		result.Error = err.Error()
		result.Message = fmt.Sprintf("Domain added but failed to get nameservers: %s", err.Error())
		result.ZoneID = zone.ID
		return result
	}

	result.Success = true
	result.ZoneID = zone.ID
	result.Nameservers = zoneDetails.NameServers

	// Add DNS records from template if provided
	if len(templateRecords) > 0 {
		dnsRecordsAdded, dnsErrors := addDNSRecordsFromTemplate(api, zone.ID, domain, templateRecords)
		result.DNSRecords = dnsRecordsAdded
		result.DNSErrors = dnsErrors

		if len(dnsErrors) > 0 {
			result.Message = fmt.Sprintf("Domain added successfully with %d DNS records (%d failed)", dnsRecordsAdded, len(dnsErrors))
		} else {
			result.Message = fmt.Sprintf("Domain added successfully with %d DNS records", dnsRecordsAdded)
		}
	} else {
		result.Message = "Domain added successfully"
	}

	return result
}

// addDNSRecordsFromTemplate adds DNS records from template to a zone
func addDNSRecordsFromTemplate(api *cloudflare.API, zoneID, domain string, templateRecords []string) (int, []string) {
	recordsAdded := 0
	errors := []string{}

	for _, recordLine := range templateRecords {
		parts := strings.Split(recordLine, "|")
		if len(parts) < 3 || len(parts) > 4 {
			errors = append(errors, fmt.Sprintf("Invalid record format: %s (expected TYPE|NAME|CONTENT or TYPE|NAME|CONTENT|PROXIED)", recordLine))
			continue
		}

		recordType := strings.TrimSpace(parts[0])
		recordName := strings.TrimSpace(parts[1])
		recordContent := strings.TrimSpace(parts[2])

		// Parse proxied setting (default to true for A and CNAME, false for others)
		proxied := false
		if len(parts) == 4 {
			proxiedStr := strings.TrimSpace(strings.ToLower(parts[3]))
			proxied = proxiedStr == "true" || proxiedStr == "1"
		} else {
			// Default proxied behavior
			if recordType == "A" || recordType == "AAAA" || recordType == "CNAME" {
				proxied = true
			}
		}

		// Convert @ to domain for name
		if recordName == "@" {
			recordName = domain
		} else if !strings.Contains(recordName, ".") {
			recordName = recordName + "." + domain
		}

		// Convert @ to domain for content (for CNAME records)
		if recordContent == "@" {
			recordContent = domain
		}

		// Create DNS record params
		params := cloudflare.CreateDNSRecordParams{
			Type:    recordType,
			Name:    recordName,
			Content: recordContent,
			TTL:     1, // Auto TTL
		}

		// Set proxied for supported record types
		if recordType == "A" || recordType == "AAAA" || recordType == "CNAME" {
			params.Proxied = &proxied
		}

		_, err := api.CreateDNSRecord(context.Background(), cloudflare.ZoneIdentifier(zoneID), params)
		if err != nil {
			errors = append(errors, fmt.Sprintf("Failed to create %s record for %s: %s", recordType, recordName, err.Error()))
		} else {
			recordsAdded++
		}
	}

	return recordsAdded, errors
}

// BulkDNSRequest represents the request for bulk DNS record addition
type BulkDNSRequest struct {
	Records string `json:"records"`
}

// BulkDNSResponse represents the response for bulk DNS addition results
type BulkDNSResponse struct {
	Success bool            `json:"success"`
	Results []BulkDNSResult `json:"results"`
	Message string          `json:"message"`
}

// BulkDNSResult represents the result of adding DNS records to a single domain
type BulkDNSResult struct {
	Domain       string   `json:"domain"`
	Success      bool     `json:"success"`
	Message      string   `json:"message"`
	Error        string   `json:"error,omitempty"`
	RecordsAdded int      `json:"records_added"`
	RecordErrors []string `json:"record_errors,omitempty"`
}

// BulkDNSHandler handles adding DNS records to multiple domains
func BulkDNSHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get API client from session
		api, err := GetAPIClient(c, store)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "API client error",
				"error":   err.Error(),
			})
		}

		// Parse request
		req := new(BulkDNSRequest)
		if err := c.BodyParser(req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Invalid request format",
				"error":   err.Error(),
			})
		}

		// Parse DNS records from the request
		dnsRecords := parseBulkDNSRecords(req.Records)
		if len(dnsRecords) == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "No valid DNS records provided",
			})
		}

		// Group records by domain
		domainRecords := groupRecordsByDomain(dnsRecords)

		// Process each domain
		results := make([]BulkDNSResult, 0, len(domainRecords))
		successCount := 0
		totalRecordsAdded := 0

		for domain, records := range domainRecords {
			result := addBulkDNSRecordsToDomain(api, domain, records)
			results = append(results, result)
			if result.Success {
				successCount++
				totalRecordsAdded += result.RecordsAdded
			}
		}

		// Return results
		message := fmt.Sprintf("Successfully processed %d domains, added %d DNS records", successCount, totalRecordsAdded)

		return c.JSON(BulkDNSResponse{
			Success: true,
			Results: results,
			Message: message,
		})
	}
}

// DNSRecordBulk represents a single DNS record for bulk processing
type DNSRecordBulk struct {
	Type    string
	Name    string
	Content string
	Domain  string
}

// parseBulkDNSRecords parses the DNS records string into a slice of DNSRecordBulk
func parseBulkDNSRecords(recordsText string) []DNSRecordBulk {
	lines := strings.Split(recordsText, "\n")
	records := make([]DNSRecordBulk, 0)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.Split(line, "|")
		if len(parts) != 4 {
			continue // Skip invalid format
		}

		record := DNSRecordBulk{
			Type:    strings.TrimSpace(parts[0]),
			Name:    strings.TrimSpace(parts[1]),
			Content: strings.TrimSpace(parts[2]),
			Domain:  strings.TrimSpace(parts[3]),
		}

		// Basic validation
		if record.Type != "" && record.Name != "" && record.Content != "" && record.Domain != "" && isValidDomain(record.Domain) {
			records = append(records, record)
		}
	}

	return records
}

// groupRecordsByDomain groups DNS records by domain
func groupRecordsByDomain(records []DNSRecordBulk) map[string][]DNSRecordBulk {
	domainRecords := make(map[string][]DNSRecordBulk)

	for _, record := range records {
		if _, exists := domainRecords[record.Domain]; !exists {
			domainRecords[record.Domain] = make([]DNSRecordBulk, 0)
		}
		domainRecords[record.Domain] = append(domainRecords[record.Domain], record)
	}

	return domainRecords
}

// addBulkDNSRecordsToDomain adds DNS records to a specific domain
func addBulkDNSRecordsToDomain(api *cloudflare.API, domain string, records []DNSRecordBulk) BulkDNSResult {
	result := BulkDNSResult{
		Domain:  domain,
		Success: false,
	}

	// Get zone ID for the domain
	zoneID, err := api.ZoneIDByName(domain)
	if err != nil {
		result.Error = err.Error()
		result.Message = fmt.Sprintf("Failed to find domain: %s", err.Error())
		return result
	}

	recordsAdded := 0
	errors := []string{}

	for _, record := range records {
		// Parse proxied setting (default to true for A and CNAME, false for others)
		proxied := false
		if record.Type == "A" || record.Type == "AAAA" || record.Type == "CNAME" {
			proxied = true
		}

		// Convert @ to domain for name
		recordName := record.Name
		if recordName == "@" {
			recordName = domain
		} else if !strings.Contains(recordName, ".") {
			recordName = recordName + "." + domain
		}

		// Convert @ to domain for content (for CNAME records)
		recordContent := record.Content
		if recordContent == "@" {
			recordContent = domain
		}

		// Create DNS record params
		params := cloudflare.CreateDNSRecordParams{
			Type:    record.Type,
			Name:    recordName,
			Content: recordContent,
			TTL:     1, // Auto TTL
		}

		// Set proxied for supported record types
		if record.Type == "A" || record.Type == "AAAA" || record.Type == "CNAME" {
			params.Proxied = &proxied
		}

		_, err := api.CreateDNSRecord(context.Background(), cloudflare.ZoneIdentifier(zoneID), params)
		if err != nil {
			errors = append(errors, fmt.Sprintf("Failed to create %s record for %s: %s", record.Type, recordName, err.Error()))
		} else {
			recordsAdded++
		}
	}

	result.RecordsAdded = recordsAdded
	result.RecordErrors = errors

	if recordsAdded > 0 {
		result.Success = true
		if len(errors) > 0 {
			result.Message = fmt.Sprintf("Added %d DNS records (%d failed)", recordsAdded, len(errors))
		} else {
			result.Message = fmt.Sprintf("Successfully added %d DNS records", recordsAdded)
		}
	} else {
		result.Message = "Failed to add any DNS records"
		if len(errors) > 0 {
			result.Error = strings.Join(errors, "; ")
		}
	}

	return result
}
