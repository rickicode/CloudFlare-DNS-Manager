package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/session"
	"github.com/gofiber/template/html/v2"

	"hijicloudflareDNS/handlers"
)

// Embed the static and templates directories into the binary
//
//go:embed templates/*.html
//go:embed static/css/*.css static/js/*.js
var embeddedFiles embed.FS

// Define global session store
var store *session.Store

func main() {
	// Initialize session store with cookie storage and 30 day expiration
	store = session.New(session.Config{
		Expiration:   30 * 24 * time.Hour, // 30 days
		CookieSecure: false,               // Set to true in production with HTTPS
		CookiePath:   "/",
		KeyLookup:    "cookie:cloudflare_dns_session",
	})

	// Initialize template engine with embedded files
	viewsFs, err := fs.Sub(embeddedFiles, "templates")
	if err != nil {
		log.Fatal("Failed to create sub fs for templates: ", err)
	}
	engine := html.NewFileSystem(http.FS(viewsFs), ".html")

	// Create new Fiber instance
	app := fiber.New(fiber.Config{
		Views: engine,
	})

	// Add logger middleware
	app.Use(logger.New())

	// Serve static files from embedded filesystem
	app.Use("/static", func(c *fiber.Ctx) error {
		path := c.Path()
		path = path[7:] // remove "/static" prefix

		// Serve CSS files
		if strings.HasPrefix(path, "/css/") {
			file, err := embeddedFiles.ReadFile("static" + path)
			if err != nil {
				return c.Status(fiber.StatusNotFound).SendString("Not Found")
			}

			c.Set("Content-Type", "text/css")
			return c.Send(file)
		}

		// Serve JavaScript files
		if strings.HasPrefix(path, "/js/") {
			file, err := embeddedFiles.ReadFile("static" + path)
			if err != nil {
				return c.Status(fiber.StatusNotFound).SendString("Not Found")
			}

			c.Set("Content-Type", "application/javascript")
			return c.Send(file)
		}

		return c.Next()
	})

	// Routes
	setupRoutes(app)

	// Start server
	log.Println("Starting server on http://localhost:3000")
	log.Fatal(app.Listen(":3000"))
}

// setupRoutes configures all application routes
func setupRoutes(app *fiber.App) {
	// Home page - API setup
	app.Get("/", func(c *fiber.Ctx) error {
		// Check if API credentials are already in the session
		sess, err := store.Get(c)
		if err == nil {
			// Check if API credentials exist in session
			valid := sess.Get(handlers.KeyAPIValid)
			if valid != nil && valid.(bool) {
				// Redirect to domains page if API credentials are valid
				return c.Redirect("/domains")
			}
		}

		return c.Render("index", fiber.Map{
			"Title": "Cloudflare DNS Manager",
		})
	})

	// API validation and auth
	app.Post("/validate-api", handlers.ValidateAPIHandler(store))
	app.Get("/logout", handlers.LogoutHandler(store))

	// Domain management
	app.Get("/domains", handlers.RenderDomainsPageHandler(store))
	app.Get("/api/domains", handlers.DomainsHandler(store))
	app.Post("/api/domains/add", handlers.AddDomainsHandler(store))

	// DNS management
	app.Get("/dns/:domain", handlers.RenderDNSPageHandler(store))
	app.Get("/api/dns/:domain", handlers.GetDNSRecordsHandler(store))
	app.Post("/api/dns/:domain", handlers.UpdateDNSRecordsHandler(store))
	app.Put("/api/dns/:domain/:id", handlers.EditDNSRecordHandler(store))
	app.Delete("/api/dns/:domain/:id", handlers.DeleteDNSRecordHandler(store))
}
