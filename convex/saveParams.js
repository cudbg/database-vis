import { mutation } from "./_generated/server";

export default mutation(async ({ db }, body, user) => {
  const old = await db
    .query("users")
    .filter(q => q.eq(user, q.field("user")))
    .first();
  if(old){
    db.delete(old._id);
  }
  db.insert("users", {user, body});
});