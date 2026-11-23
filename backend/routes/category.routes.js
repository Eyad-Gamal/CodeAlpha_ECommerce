const express = require('express');
const categoryController = require('../controllers/category.controller');
const { requireAuth, optionalAuth, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', optionalAuth, categoryController.getCategories);
router.post('/', requireAuth, requireRole('admin'), categoryController.createCategory);
router.put('/:id', requireAuth, requireRole('admin'), categoryController.updateCategory);
router.delete('/:id', requireAuth, requireRole('admin'), categoryController.deleteCategory);

module.exports = router;
