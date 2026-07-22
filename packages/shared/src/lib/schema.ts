import { siteConfig } from "@site/config";

const BASE_URL = siteConfig.url;

const AUTHOR = {
  name: "Chester Beard",
  url: "https://soaktrail.com/about",
  bio: "Independent researcher and field journalist documenting natural hot springs across North America. Has visited and catalogued hundreds of geothermal sites from Alaska to the Desert Southwest.",
  sameAs: [
    "https://www.instagram.com/soaktrail",
    "https://bsky.app/profile/soaktrail.bsky.social",
  ],
};

export function buildPersonSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: AUTHOR.name,
    url: AUTHOR.url,
    description: AUTHOR.bio,
    jobTitle: "Researcher & Field Journalist",
    worksFor: {
      "@type": "Organization",
      name: siteConfig.name,
      url: BASE_URL,
    },
    sameAs: AUTHOR.sameAs,
  };
}

export function buildPlaceSchema(spring: {
  name: string;
  slug: string;
  description: string;
  lat: number;
  lng: number;
  state: string;
  temp_f?: number;
  fee?: number;
  access_type?: string;
  season?: string;
  elevation_ft?: number;
  hours?: string;
  development?: string;
}) {
  const props: any[] = [];

  if (spring.temp_f) {
    props.push({ "@type": "PropertyValue", name: "Water Temperature", value: `${spring.temp_f}\u00b0F` });
  }
  if (spring.fee !== undefined) {
    props.push({ "@type": "PropertyValue", name: "Entry Fee", value: spring.fee === 0 ? "Free" : `$${spring.fee}` });
  }
  if (spring.access_type) {
    props.push({ "@type": "PropertyValue", name: "Access Type", value: spring.access_type });
  }
  if (spring.season) {
    props.push({ "@type": "PropertyValue", name: "Season", value: spring.season });
  }
  if (spring.elevation_ft) {
    props.push({ "@type": "PropertyValue", name: "Elevation", value: `${spring.elevation_ft} ft` });
  }
  if (spring.hours) {
    props.push({ "@type": "PropertyValue", name: "Hours", value: spring.hours });
  }
  if (spring.development) {
    props.push({ "@type": "PropertyValue", name: "Development", value: spring.development });
  }

  return {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: spring.name,
    description: spring.description,
    url: `${BASE_URL}/springs/${spring.slug}`,
    geo: {
      "@type": "GeoCoordinates",
      latitude: spring.lat,
      longitude: spring.lng,
    },
    address: {
      "@type": "PostalAddress",
      addressRegion: spring.state,
      addressCountry: "US",
    },
    isAccessibleForFree: spring.fee === 0 || spring.fee === undefined,
    ...(props.length > 0 ? { additionalProperty: props } : {}),
    author: {
      "@type": "Person",
      name: AUTHOR.name,
      url: AUTHOR.url,
    },
  };
}

export function getAuthorByline() {
  return `Researched & maintained by ${AUTHOR.name}`;
}

export function getAuthor() {
  return AUTHOR;
}

export function buildWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: BASE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${BASE_URL}${siteConfig.ogImage}`,
      width: 1200,
      height: 630,
    },
    sameAs: siteConfig.sameAs || [],
  };
}

export function buildArticleSchema(
  entry: {
    data: {
      title: string;
      description?: string | null;
      date?: string | Date;
      updatedDate?: string | Date;
      image?: { src: string } | string;
      author?: { id: string } | string;
    };
    body?: string;
  },
  pathname: string
) {
  const { title, description, date, updatedDate, image, author } = entry.data;

  const datePublished = date
    ? typeof date === "string"
      ? date
      : date.toISOString()
    : undefined;

  const dateModified = updatedDate
    ? typeof updatedDate === "string"
      ? updatedDate
      : updatedDate.toISOString()
    : datePublished;

  const imageUrl =
    typeof image === "string"
      ? image.startsWith("http")
        ? image
        : `${BASE_URL}${image}`
      : image?.src
        ? image.src.startsWith("http")
          ? image.src
          : `${BASE_URL}${image.src}`
        : `${BASE_URL}${siteConfig.ogImage}`;

  const authorName =
    typeof author === "string"
      ? author
      : author?.id
        ? author.id
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
        : siteConfig.name;

  const article: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: description || undefined,
    image: imageUrl,
    datePublished,
    dateModified,
    author: {
      "@type": authorName === siteConfig.name ? "Organization" : "Person",
      name: authorName,
      url: `${BASE_URL}/authors/${typeof author === "object" && author?.id ? author.id : "soak-colorado"}`,
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.name,
      url: BASE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}${siteConfig.ogImage}`,
        width: 1200,
        height: 630,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}${pathname}`,
    },
    url: `${BASE_URL}${pathname}`,
  };

  // Remove undefined values
  Object.keys(article).forEach((key) => {
    if (article[key] === undefined) delete article[key];
  });

  return article;
}

export function buildFaqSchema(htmlBody: string) {
  // Extract Q&A pairs from <details>/<summary> + .faq-answer pattern
  const regex =
    /<details[^>]*>\s*<summary>(.*?)<\/summary>\s*<div[^>]*class="faq-answer"[^>]*>(.*?)<\/div>\s*<\/details>/gis;
  const pairs: { question: string; answer: string }[] = [];
  let match;
  while ((match = regex.exec(htmlBody)) !== null) {
    const question = stripHtml(match[1]).trim();
    const answer = stripHtml(match[2]).trim();
    if (question && answer) {
      pairs.push({ question, answer });
    }
  }

  if (pairs.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map((pair) => ({
      "@type": "Question",
      name: pair.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: pair.answer,
      },
    })),
  };
}

export function buildBreadcrumbSchema(
  parts: { label: string; href: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: parts.map((part, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: part.label,
      item: part.href.startsWith("http")
        ? part.href
        : `${BASE_URL}${part.href}`,
    })),
  };
}

export function buildItemListSchema(
  springs: {
    name: string;
    slug: string;
    description: string;
    lat: number;
    lng: number;
    temp_f?: number;
    fee?: number;
    access_type?: string;
    season?: string;
  }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${siteConfig.name} Hot Springs`,
    description: siteConfig.description,
    url: `${BASE_URL}${siteConfig.mapUrl}`,
    itemListElement: springs.map((spring, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "TouristAttraction",
        name: spring.name,
        description: spring.description,
        url: `${BASE_URL}${siteConfig.mapUrl}#${spring.slug}`,
        geo: {
          "@type": "GeoCoordinates",
          latitude: spring.lat,
          longitude: spring.lng,
        },
        address: {
          "@type": "PostalAddress",
          addressRegion: siteConfig.region,
          addressCountry: "US",
        },
        additionalProperty: [
          ...(spring.temp_f
            ? [
                {
                  "@type": "PropertyValue",
                  name: "Temperature",
                  value: `${spring.temp_f}°F`,
                },
              ]
            : []),
          ...(spring.fee !== undefined
            ? [
                {
                  "@type": "PropertyValue",
                  name: "Entry Fee",
                  value: spring.fee === 0 ? "Free" : `$${spring.fee}`,
                },
              ]
            : []),
          ...(spring.access_type
            ? [
                {
                  "@type": "PropertyValue",
                  name: "Access Type",
                  value: spring.access_type,
                },
              ]
            : []),
          ...(spring.season
            ? [
                {
                  "@type": "PropertyValue",
                  name: "Season",
                  value: spring.season,
                },
              ]
            : []),
        ],
      },
    })),
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
    .replace(/\+\s*$/, ""); // remove trailing + from faq-icon spans
}
