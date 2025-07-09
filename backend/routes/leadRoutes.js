// backend/routes/leadRoutes.js
const express = require('express');
const multer = require('multer');
const leadController = require('../controllers/leadController'); // We will create this next

const router = express.Router();
const upload = multer({ dest: 'uploads/' }); // Tell multer to save files in the 'uploads' folder

// When a POST request comes to /upload with a file attached,
// use multer to handle the file upload, then call the uploadLeads function
router.post('/upload', upload.single('leadsFile'), leadController.uploadLeads);

module.exports = router;