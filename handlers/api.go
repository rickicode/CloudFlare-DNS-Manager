package handlers

import (
	"context"

	"github.com/cloudflare/cloudflare-go"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/session"
)

// APICredentials struct holds the Cloudflare API credentials
type APICredentials struct {
	Email  string `json:"email"`
	APIKey string `json:"apiKey"`
}

// SessionKeys constants for session data
const (
	KeyAPICredentials = "apiCredentials"
	KeyAPIValid       = "apiValid"
)

// LogoutHandler handles user logout by clearing the session
func LogoutHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sess, err := store.Get(c)
		if err != nil {
			return c.Redirect("/")
		}

		// Destroy the session
		if err := sess.Destroy(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to logout",
				"error":   err.Error(),
			})
		}

		return c.Redirect("/")
	}
}

// ValidateAPIHandler handles the API credentials validation
func ValidateAPIHandler(store *session.Store) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Parse incoming credentials
		creds := new(APICredentials)
		if err := c.BodyParser(creds); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Invalid request format",
				"error":   err.Error(),
			})
		}

		// Validate required fields
		if creds.Email == "" || creds.APIKey == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Email and API Key are required",
			})
		}

		// Create Cloudflare API client
		api, err := cloudflare.New(creds.APIKey, creds.Email)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to initialize Cloudflare API client",
				"error":   err.Error(),
			})
		}

		// Test API connection by getting user details
		_, err = api.UserDetails(context.Background())
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid API credentials",
				"error":   err.Error(),
			})
		}

		// Store credentials in session
		sess, err := store.Get(c)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Session error",
				"error":   err.Error(),
			})
		}

		// Store as individual values instead of the struct to avoid serialization issues
		sess.Set(KeyAPIValid, true)
		sess.Set("apiEmail", creds.Email)
		sess.Set("apiKey", creds.APIKey)

		if err := sess.Save(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to save session",
				"error":   err.Error(),
			})
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": "API credentials validated successfully",
		})
	}
}

// GetAPIClient retrieves a Cloudflare API client using credentials from the session
func GetAPIClient(c *fiber.Ctx, store *session.Store) (*cloudflare.API, error) {
	sess, err := store.Get(c)
	if err != nil {
		return nil, err
	}

	// Check if API credentials exist in session
	valid := sess.Get(KeyAPIValid)
	if valid == nil || valid.(bool) == false {
		return nil, fiber.NewError(fiber.StatusUnauthorized, "API credentials not found or invalid")
	}

	// Retrieve credentials from individual session values
	email := sess.Get("apiEmail")
	apiKey := sess.Get("apiKey")

	if email == nil || apiKey == nil {
		return nil, fiber.NewError(fiber.StatusUnauthorized, "API credentials not found")
	}

	// Type assertions
	emailStr, ok1 := email.(string)
	apiKeyStr, ok2 := apiKey.(string)

	if !ok1 || !ok2 {
		return nil, fiber.NewError(fiber.StatusInternalServerError, "Invalid credential format in session")
	}

	// Create and return API client
	return cloudflare.New(apiKeyStr, emailStr)
}
