import { slugify } from "@lib/textConverter";

const taxonomyFilter = (posts: any[], name: string, key: string) =>
  posts.filter((post) =>
    post.data?.[name]?.map((n: string) => slugify(n))?.includes(key),
  );

export default taxonomyFilter;
