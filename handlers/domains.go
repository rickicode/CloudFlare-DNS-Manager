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

// DomainsHandler handles fetching domains from Cloudflare
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

		// Get zones (domains) from Cloudflare
		zones, err := api.ListZones(context.Background())
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to fetch domains",
				"error":   err.Error(),
			})
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

		return c.JSON(fiber.Map{
			"success": true,
			"data":    domains,
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
		if valid == nil || valid.(bool) == false {
			return c.Redirect("/")
		}

		return c.Render("domains", fiber.Map{})
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
