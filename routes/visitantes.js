const express = require("express");
const path = require("path");

const router = express.Router();

const visitantesController =
require("../controllers/visitantesController");




// ===============================
// PÁGINA VISITANTES
// ===============================


router.get(
    "/visitantes",
    (req,res)=>{


        res.sendFile(
            path.join(
                __dirname,
                "../public/visitantes.html"
            )
        );


    }
);






// ===============================
// API LISTAR VISITANTES
// ===============================


router.get(
    "/api/visitantes",
    visitantesController.listarVisitantes
);






// ===============================
// ATUALIZAR PACIENTE
// ===============================


router.put(
    "/api/visitantes/:id",
    visitantesController.atualizarVisitante
);






module.exports = router;