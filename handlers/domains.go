package handlers

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/session"
)

// Domain represents a Cloudflare domain
type Domain struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
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
			domains[i] = Domain{
				ID:     zone.ID,
				Name:   zone.Name,
				Status: zone.Status,
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
