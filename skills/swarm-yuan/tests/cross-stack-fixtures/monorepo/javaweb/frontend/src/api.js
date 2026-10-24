import request from "./request"
export const load = () => request.get("/users")
