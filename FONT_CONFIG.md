# Font Configuration - Soak Trail

## Font Usage

### National Park (font-display) - Used for:
- **All headings**: h1, h2, h3, h4
- **Hero title**: "Find Your Perfect Soak"
- **Section titles**: "Natural Thermal Waters", "Regional Guides", etc.
- **Regional site titles**: "Washington Hot Springs", etc.

### Fraunces (font-body) - Used for:
- **Navigation**: Menu items, logo text
- **Body text**: Paragraphs, descriptions
- **Labels**: "500+ Natural Springs Mapped", stat labels
- **Buttons**: "Explore Destinations", "Visit Website", etc.
- **MCP section labels**: "5 Search Tools", "Coverage", etc.

## Verification

Current font assignments:
- H1 (Hero): font-display ✓
- H2 (Sections): font-display ✓
- H3 (Subsections): font-display ✓
- Nav items: font-body ✓
- Body text: font-body ✓
- Buttons: font-body ✓

## Configuration Files

- **tailwind.config.mjs**: Defines font families
  - font-display: National Park
  - font-body: Fraunces

- **src/layouts/BaseLayout.astro**: Loads Google Fonts
  - Fraunces (serif)
  - National Park (sans-serif)

## Branding

- **Site title**: "Soak Trail" (updated from "SoakAtlas")
- **Font**: Fraunces (navigation and body)
- **Page title**: "Soak Trail — Find Your Perfect Spring"
