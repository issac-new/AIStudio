import request from "./request"
export function load() { return request.get("/users") }
