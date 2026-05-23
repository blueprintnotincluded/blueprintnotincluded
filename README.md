# Blueprintnotincluded

This is the source repo of blueprintnotincluded.org

It is a combined curated version of the original blueprintnotincluded web app.

## Development Setup

### Development (Recommended)
For ARM64 Macs and local development with live reloading:

```bash
# One-time setup: copy environment configuration
cp .env.sample .env

# Start dependencies only (database + mail)
./dev-setup.sh

# In separate terminals:
npm run dev              # Backend with live reloading
cd frontend && npm start # Frontend with live reloading
```

- **Frontend**: http://localhost:4200 (Angular dev server with API proxy)
- **Backend API**: http://localhost:3000 (Express with ts-node-dev)
- **Database**: mongodb://localhost:27017
- **Mail testing**: http://localhost:8025 (Mailpit web UI)

### Production Testing
Test with pre-built images (may require AMD64 emulation on ARM64 Macs):

```bash
docker compose up
```

Visit http://localhost:3000
To check incoming emails visit: http://localhost:8025

## Docker image building

Build the image

`docker build . -t bpni:latest`

Run mongodb

`docker run -d -p 27017:27017 mongo:8.0.23`

Run the image and backend

`docker run -d -p 3000:3000 -e JWT_SECRET=mysecretkey -e ENV_NAME=development -e CAPTCHA_SITE=localhost -e CAPTCHA_SECRET=mysecretkey -e DB_URI="mongodb://127.0.0.1:27017/blueprintnotincluded" bpni:latest`

Visit http://localhost:3000

## Image reconstruction
Export iamges from oniextract2020
Copy assets/manual/ into assets/images
`npm run fixHtmlLabels -- database.json`
`npm run addInfoIcons -- database.json`
`npm run generateIcons`
`npm run generateGroups`
`npm run generateWhite`
`npm run generateRepack`
zip assets/database/database.json
copy zip to frontend/src/assets/database
copy assets/database/database-repack.json to frontend/src/assets/database.json