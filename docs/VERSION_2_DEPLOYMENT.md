# Version 2.0 Side-by-Side Deployment

Version 1 and Version 2 use independent Compose projects, networks, ports, images, databases, Redis instances, and Docker volumes.

| Service | Version 1 | Version 2 |
|---|---|---|
| Application | `http://localhost:8080` | `http://localhost:18080` |
| Backend API | `http://localhost:8000` | `http://localhost:18000` |
| Standalone frontend | `http://localhost:8081` | `http://localhost:18081` |
| PostgreSQL | `localhost:5432` | `localhost:55432` |
| Redis | `localhost:6379` | `localhost:56379` |
| pgAdmin | `http://localhost:5050` | `http://localhost:15050` |
| Nginx proxy | `http://localhost:80` | `http://localhost:180` |

V2 images:

```text
vinodreddy1999/metam-services-v2-fullstack:2.0.0-beta.4
vinodreddy1999/metam-services-v2-frontend:2.0.0-beta.4
```

Start V2 without stopping V1:

```bash
docker compose up -d --build
```

Stop V2 only:

```bash
docker compose down
```

Do not use `-v` when stopping unless the V2 database should also be deleted.

Current browser and role evidence is recorded in [Version 2 Current Role and Route Validation](VERSION_2_CURRENT_VALIDATION.md).
