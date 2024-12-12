import { query } from "./_generated/server";

export default query(async ({ db }, author) => {
  const user = await db
    .query("users")
    .filter(q => q.eq(author, q.field("user")))
    .first();
  if (user) {
    return user.body;
  }
  return null;
});