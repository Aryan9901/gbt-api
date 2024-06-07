const { Router } = require("express");
const { authUser } = require("../middlewares/auth.middleware.js");
const { getStatements } = require("../controllers/statement.controller.js");
const router = Router();
// !! secured routes --------------------------------
router.route("/get/statements").get(authUser, getStatements);

module.exports = router;
