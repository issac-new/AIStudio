const { pool } = require("../db")
exports.list = () => pool.query("SELECT 1")
