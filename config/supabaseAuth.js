"use strict";

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = String(
    process.env.KAHENNA_SUPABASE_URL || ""
).trim();

const supabaseKey = String(
    process.env.KAHENNA_SUPABASE_KEY || ""
).trim();

if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        "SUPABASE_URL e SUPABASE_KEY são obrigatórios."
    );
}

function criarClienteAuth() {
    return createClient(
        supabaseUrl,
        supabaseKey,
        {
            auth: {
                autoRefreshToken: false,
                detectSessionInUrl: false,
                persistSession: false
            }
        }
    );
}

module.exports = criarClienteAuth;
