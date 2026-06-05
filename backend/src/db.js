const { Pool } = require("pg");

const pool = new Pool({
    user: "amankashyap",
    host: "localhost",
    database: "ci_cd_engine",
    password: "",
    port: 5432
});

module.exports = pool;