const express = require('express');
const { body, validationResult } = require('express-validator');

const router = express.Router();

router.post(
  '/',
  body('name').isString().isLength({ min: 1, max: 64 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    res.json({ ok: true });
  }
);

module.exports = router;
