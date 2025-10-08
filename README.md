# Biagram

Modern database diagram tool with a code-first approach. Create beautiful database diagrams using DBML syntax with real-time collaboration features.

## ✨ Features

- **Code-First Approach**: Write your database schema in DBML syntax
- **Real-time Collaboration**: Work together with your team in real-time
- **High Performance**: Built with modern web technologies for smooth interactions
- **Import/Export**: Import from DDL, export to various formats (PNG, SVG, PDF, SQL)
- **Interactive Canvas**: Zoom, pan, and interact with your diagrams
- **Type Safety**: Full TypeScript support throughout the stack

## 🏗️ Architecture

Biagram is built with:

### Frontend
- **Next.js 14** with App Router
- **tRPC** for type-safe API communication
- **Tailwind CSS** + **shadcn/ui** for styling
- **Monaco Editor** for code editing
- **Custom Canvas Engine** for diagram rendering

### Backend
- **Node.js 22** runtime
- **Next.js Route Handlers** + **tRPC** for APIs
- **Drizzle ORM** with **PostgreSQL**
- **Lucia** for authentication
- **Vercel** for hosting

### Packages
- `@biagram/shared` - Shared types and database schemas
- `@biagram/dbml-parser` - High-performance DBML parser
- `@biagram/diagram-engine` - Canvas-based rendering engine

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- PostgreSQL database

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd biagram
   ```

2. **Run setup script**
   ```bash
   ./scripts/setup.sh
   ```

3. **Configure environment**
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   # Edit .env.local with your database URL and other settings
   ```

4. **Set up database**
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

5. **Start development**
   ```bash
   pnpm dev
   ```

Visit [http://localhost:3000](http://localhost:3000) to see your application.

## 📖 DBML Syntax

Biagram uses DBML (Database Markup Language) for defining schemas:

```dbml
Table users {
  id integer [primary key]
  username varchar [unique]
  email varchar [unique]
  created_at timestamp [default: `now()`]
}

Table posts {
  id integer [primary key]
  title varchar
  content text
  user_id integer [ref: > users.id]
  created_at timestamp [default: `now()`]
}

Enum post_status {
  draft
  published
  archived
}
```

## 🛠️ Development

### Monorepo Structure

```
biagram/
├── apps/
│   └── web/                 # Next.js application
├── packages/
│   ├── shared/              # Shared types & schemas
│   ├── dbml-parser/         # DBML parsing engine
│   └── diagram-engine/      # Canvas rendering engine
├── scripts/                 # Development scripts
└── tools/                   # Build tools & configs
```

### Available Scripts

```bash
# Development
pnpm dev                     # Start development servers
pnpm build                   # Build all packages
pnpm test                    # Run tests
pnpm lint                    # Lint code

# Database
pnpm db:generate             # Generate migrations
pnpm db:migrate              # Run migrations
pnpm db:studio              # Open Drizzle Studio

# Package-specific
pnpm dev --filter=web        # Run only web app
pnpm build --filter=shared   # Build only shared package
```

### Adding Dependencies

```bash
# Add to web app
pnpm add <package> --filter=web

# Add to shared package
pnpm add <package> --filter=@biagram/shared

# Add to workspace root
pnpm add <package> -w
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run E2E tests
pnpm test:e2e
```

## 🚢 Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main

### Manual Deployment

```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [dbdiagram.io](https://dbdiagram.io)
- Built with amazing open-source tools and libraries
- Thanks to the community for feedback and contributions