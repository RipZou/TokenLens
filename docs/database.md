# Database schema

Source of truth: `prisma/schema.prisma`.

```mermaid
erDiagram
    users ||--o{ memberships : has
    organizations ||--o{ memberships : has
    organizations ||--o{ projects : owns
    projects ||--o{ api_keys : has

    users {
        uuid id PK
        text email UK
        text password_hash
    }
    organizations {
        uuid id PK
        text name
    }
    memberships {
        uuid user_id PK, FK
        uuid org_id PK, FK
        role role
    }
    projects {
        uuid id PK
        uuid org_id FK
        uuid created_by FK
        text name
    }
    api_keys {
        uuid id PK
        uuid project_id FK
        text key_hash UK
        text prefix
        timestamptz revoked_at
    }
```
