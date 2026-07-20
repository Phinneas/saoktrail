export const typeDefs = `
  type RoadStatus {
    status: String!
    message: String!
  }

  type ChemistryDetails {
    temperature_c: Float
    ph: Float
    sulfate_mg_l: Float
    calcium_mg_l: Float
    magnesium_mg_l: Float
    sodium_mg_l: Float
    iron_mg_l: Float
    fluoride_mg_l: Float
    arsenic_mg_l: Float
    silica_mg_l: Float
    potassium_mg_l: Float
    lithium_mg_l: Float
    conductance_us_cm: Float
    tds_mgL: Float
  }

  type WeatherData {
    temperature_f: Int!
    description: String!
    wind_speed: String!
    fetched_at: String!
  }

  type Spring {
    id: ID!
    slug: String!
    name: String!
    lat: Float!
    lon: Float!
    elevation_ft: Int!
    temperature_f: Int!
    access_type: String!
    development: String!
    chemistry: [String!]!
    state: String!
    fs_road: String
    description: String
    image_url: String
    weather: WeatherData
    road_status: RoadStatus
    source_temperature_c: Float
    chemistry_source: String
    chemistry_sampled_on: String
    chemistry_level: String
    chemistry_details: ChemistryDetails!
  }

  type BlogPost {
    id: ID!
    slug: String!
    title: String!
    body: String!
    excerpt: String
    tags: [String!]!
    featured_springs: [String!]!
    published_at: String
    author: String!
  }

  type Query {
    springs(limit: Int = 20, offset: Int = 0, state: String, access_type: String): [Spring!]!
    spring(slug: String!): Spring
    blogPosts(limit: Int = 20, offset: Int = 0): [BlogPost!]!
    blogPost(slug: String): BlogPost
  }
`;
