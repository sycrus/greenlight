# Google Slides + Drive API

## Official docs
- [Slides API guides](https://developers.google.com/slides/api/guides)
- [Slides API reference](https://developers.google.com/slides/api/reference/rest)
- [Drive API — manage sharing](https://developers.google.com/drive/api/guides/manage-sharing)
- [batchUpdate](https://developers.google.com/slides/api/guides/batch)

## Greenlight pattern (Day 4)

Two deck variants from one template:
- **ECD version** — internal: all territory slides, risk flags, strategic rationale
- **Client version** — external: omits risk flags and internal rationale

## Auth

Service account with domain-wide delegation:
- Scope: `https://www.googleapis.com/auth/presentations`
- Scope: `https://www.googleapis.com/auth/drive.file`

## Rate limits

| Limit | Value |
|---|---|
| Requests per 100 seconds | 100 per user |
| Write requests per 100 seconds | 100 per user |

**Always batch into a single `batchUpdate`** — never make one request per slide.

## Sharing

```typescript
// ECD: Commenter
await drive.permissions.create({
  fileId: presentationId,
  requestBody: {
    type: "user",
    role: "commenter",
    emailAddress: ecdEmail,
  },
})

// Client: Viewer
await drive.permissions.create({
  fileId: presentationId,
  requestBody: {
    type: "user",
    role: "reader",
    emailAddress: clientEmail,
  },
})
```

## Slide structure (per territory, PRD §5 Stage 4a)

| Slide | Content |
|---|---|
| Territory cover | Name, creative proposition, tone descriptor |
| Visual language | Reference images from GCS, palette swatches, cinematography |
| Ingredients | Character/location/object refs + Flow ingredient prompts |
| Scene arc | Emotional arc, scene count, platform format |
| Brand alignment | Brand rules applied, risk flags (ECD only) |
| Production notes | Shot language brief, negative prompt list |
