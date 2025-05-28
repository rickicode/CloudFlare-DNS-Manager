# 🌐 Cloudflare DNS Manager

A powerful web-based application for managing Cloudflare domains and DNS records with bulk operations and template support.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Go Version](https://img.shields.io/badge/go-1.21+-blue.svg)
![Cloudflare API](https://img.shields.io/badge/Cloudflare-API%20v4-orange.svg)

## ✨ Features

### 🔐 **Credential Management**
- **Auto-Save Credentials**: Store Cloudflare API credentials securely in browser localStorage
- **30-Day Expiry**: Automatic credential expiration for security
- **One-Click Test**: Test stored credentials without re-entering
- **Session Management**: Persistent login sessions

### 🌍 **Bulk Domain Management**
- **Mass Domain Addition**: Add multiple domains simultaneously
- **Template Support**: Apply DNS templates during domain creation
- **Nameserver Display**: Auto-display nameservers for domain configuration
- **Progress Tracking**: Detailed results for each domain operation

### 📋 **DNS Template System**
- **Pre-built Templates**: Default template with common DNS records
- **Custom Templates**: Create and manage custom DNS templates
- **Proxied Support**: Full control over Cloudflare proxy settings
- **Template Formats**: Support for `TYPE|NAME|CONTENT|PROXIED` format
- **LocalStorage**: Templates saved locally for persistence

### ⚡ **DNS Record Management**
- **Bulk DNS Operations**: Add/update multiple DNS records at once
- **Record Editing**: Individual record edit and delete operations
- **Real-time Updates**: Live DNS record display and management
- **Format Validation**: Intelligent DNS record format validation

### 🎨 **Modern UI/UX**
- **Responsive Design**: Works on desktop and mobile devices
- **Copy-to-Clipboard**: One-click nameserver copying
- **Interactive Results**: Detailed operation results with status indicators
- **Clean Interface**: Intuitive and user-friendly design

## 🚀 Quick Start

### Prerequisites

- **Go 1.21+** installed
- **Cloudflare Account** with API access
- **Domain** registered and using Cloudflare nameservers

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/cloudflare-dns-manager.git
   cd cloudflare-dns-manager
   ```

2. **Install dependencies**
   ```bash
   go mod tidy
   ```

3. **Run the application**
   ```bash
   go run main.go
   ```

4. **Access the application**
   ```
   http://localhost:3000
   ```

### Configuration

1. **Get Cloudflare API Credentials**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to "My Profile" → "API Tokens"
   - Create a **Global API Key** or **Custom Token** with Zone permissions

2. **Login to Application**
   - Enter your Cloudflare email
   - Enter your API key/token
   - Check "Remember credentials" for convenience
   - Click "Validate API Key"

## 📖 Usage Guide

### Adding Domains with Templates

1. **Navigate to Domains page** after login
2. **Select a DNS template** from dropdown:
   - **No Template**: Create domain without DNS records
   - **Default Template**: Pre-configured A and CNAME records
   - **Custom Templates**: Your saved templates
3. **Enter domains** (one per line):
   ```
   example1.com
   example2.com
   subdomain.example3.com
   ```
4. **Click "Add Domains"**
5. **Copy nameservers** from results to configure at your domain registrar

### Creating Custom Templates

1. **Click "Manage Templates"** button
2. **Enter template name** (e.g., "E-commerce Template")
3. **Add DNS records** in format `TYPE|NAME|CONTENT|PROXIED`:
   ```
   A|@|192.168.1.100|true
   CNAME|www|@|true
   CNAME|shop|@|false
   CNAME|api|@|false
   MX|@|10 mail.example.com|false
   TXT|@|v=spf1 include:_spf.google.com ~all|false
   ```
4. **Save template** for future use

### DNS Template Format

```
TYPE|NAME|CONTENT|PROXIED
```

- **TYPE**: DNS record type (A, CNAME, MX, TXT, etc.)
- **NAME**: Record name (use `@` for root domain)
- **CONTENT**: Record content (use `@` to reference domain)
- **PROXIED**: `true`/`false` for Cloudflare proxy (optional)

**Examples:**
```
A|@|138.199.137.90|true
CNAME|www|@|true
CNAME|api|@|false
MX|@|10 mail.domain.com
TXT|@|v=spf1 include:_spf.google.com ~all
```

### Managing DNS Records

1. **Select domain** from domains page
2. **View existing records** in organized table
3. **Add bulk records** using the DNS form
4. **Edit individual records** using edit buttons
5. **Delete records** as needed

## 🏗️ Architecture

### Backend (Go/Fiber)
- **Fiber Framework**: Fast HTTP web framework
- **Cloudflare Go SDK**: Official Cloudflare API client
- **Session Management**: Secure session handling
- **Template Processing**: DNS template parsing and validation

### Frontend (HTML/CSS/JavaScript)
- **Vanilla JavaScript**: No framework dependencies
- **LocalStorage**: Client-side data persistence
- **Responsive CSS**: Mobile-friendly design
- **Real-time Updates**: Dynamic content loading

### File Structure
```
cloudflare-dns-manager/
├── main.go                 # Application entry point
├── handlers/
│   ├── api.go             # API credential handling
│   ├── domains.go         # Domain management
│   └── dns.go             # DNS record operations
├── templates/
│   ├── index.html         # Login page
│   ├── domains.html       # Domain management
│   └── dns.html           # DNS record management
├── static/
│   ├── css/styles.css     # Application styles
│   └── js/script.js       # Client-side logic
├── go.mod                 # Go modules
└── README.md              # This file
```

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/validate-api` | Validate Cloudflare credentials |
| `GET` | `/domains` | Domain management page |
| `GET` | `/api/domains` | List domains |
| `POST` | `/api/domains/add` | Add domains with templates |
| `GET` | `/dns/:domain` | DNS management page |
| `GET` | `/api/dns/:domain` | Get DNS records |
| `POST` | `/api/dns/:domain` | Add/update DNS records |
| `PUT` | `/api/dns/:domain/:id` | Edit DNS record |
| `DELETE` | `/api/dns/:domain/:id` | Delete DNS record |

## 🎯 Default Template

The application includes a default template with common DNS records:

```
A|@|138.199.137.90|true       # Root domain with proxy
CNAME|www|@|true              # WWW subdomain with proxy
CNAME|shop|@|true             # Shop subdomain with proxy
CNAME|buy|@|true              # Buy subdomain with proxy
```

All records use `proxied=true` for Cloudflare's security and performance benefits.

## 🔒 Security Features

- **Credential Encryption**: API credentials stored securely in localStorage
- **Auto-Expiry**: 30-day automatic credential expiration
- **Session Management**: Secure server-side sessions
- **Input Validation**: Comprehensive DNS format validation
- **Error Handling**: Detailed error messages without exposing sensitive data

## 🚀 Deployment

### Local Development
```bash
go run main.go
```

### Production Build
```bash
go build -o cloudflare-dns-manager main.go
./cloudflare-dns-manager
```

### Docker (Optional)
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o cloudflare-dns-manager main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/cloudflare-dns-manager .
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static
EXPOSE 3000
CMD ["./cloudflare-dns-manager"]
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Cloudflare](https://cloudflare.com) for the excellent API
- [Fiber](https://gofiber.io/) for the fast Go web framework
- [Font Awesome](https://fontawesome.com/) for the beautiful icons

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/yourusername/cloudflare-dns-manager/issues) page
2. Create a new issue with detailed information
3. Include logs and reproduction steps

---

**Made with ❤️ for the developer community**