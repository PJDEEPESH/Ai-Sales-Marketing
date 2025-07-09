// backend/controllers/leadController.js
const fs = require('fs');
const csv = require('csv-parser');
const pool = require('../db'); // Our database connection

// This is the main function that will be exported
exports.uploadLeads = (req, res) => {
  // Check if a file was actually uploaded
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const leads = [];
  const filePath = req.file.path; // The path to the temporary file multer saved

  // 1. Read the CSV file
  fs.createReadStream(filePath)
    .pipe(csv()) // Use the csv-parser library to read row-by-row
    .on('data', (row) => {
      // 'row' is an object like: { firstName: 'John', lastName: 'Doe', ... }
      leads.push(row);
    })
    .on('end', async () => {
      // This block runs after the entire file has been read
      console.log('CSV file successfully processed. Found', leads.length, 'leads.');

      try {
        // 2. Insert leads into the database
        for (const lead of leads) {
          const fullName = `${lead.firstName} ${lead.lastName}`;
          
          // This is our SQL query. The '$1, $2, ...' are placeholders to prevent security risks.
          const insertQuery = `
            INSERT INTO leads (full_name, company, title, email, linkedin_url)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (email) DO NOTHING;
          `; 
          // ON CONFLICT... means if we try to add a lead with an email that already exists, just skip it.
          
          const values = [
            fullName,
            lead.company,
            lead.title,
            lead.email,
            lead.linkedinUrl
          ];

          // Execute the query
          await pool.query(insertQuery, values);
        }
        
        console.log('Successfully inserted leads into the database.');
        
        // 3. Clean up and send a success response
        fs.unlinkSync(filePath); // Delete the temporary file from the 'uploads' folder
        res.status(201).json({ message: `Successfully uploaded and saved ${leads.length} leads!` });

      } catch (error) {
        console.error('Error saving leads to database:', error);
        fs.unlinkSync(filePath); // Still delete the temp file on error
        res.status(500).json({ message: 'Failed to save leads to the database.' });
      }
    });
};