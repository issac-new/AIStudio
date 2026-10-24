import client from "./client"
export const load = () => client.get("/users")
