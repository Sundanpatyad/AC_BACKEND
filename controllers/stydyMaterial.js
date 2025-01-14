const Material = require('../models/studyMaterials')
const Category = require('../models/studyMaterials')
const Comment = require('../models/studyMaterials')


exports.createMaterial = async (req, res) => {
  try {
    // console.log(req.body);
    const { title, downloadLink, category, } = req.body;
    console.log(title);
    console.log(category);
   
    // Validate input fields (basic example)
    if (!title || !downloadLink || !category) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Create and save a new Material instance
    const material = await Material.create({
      title,
      downloadLink,
      category
    });

    // Respond with the created material
    res.status(201).json(material);
  } catch (error) {
    console.error('Error creating material:', error); // Log the error for debugging
    res.status(500).json({ message: 'An error occurred while creating the material.' });
  }
};

exports.getMaterials = async (req, res) => {
  try {
    const materials = await Material.find().populate('category');
    res.json(materials);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMaterialsByCategory = async (req, res) => {
  try {
    const materials = await Material.find({ category: req.params.categoryId }).populate('category');
    res.json(materials);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
  
 
exports.createCategory = async (req, res) => {
  try {
    const category = new Category(req.body);
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createComment = async (req, res) => {
  try {
    const comment = new Comment(req.body);
    await comment.save();
    res.status(201).json(comment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getCommentsByMaterial = async (req, res) => {
  try {
    const comments = await Comment.find({ material: req.params.materialId }).sort('-createdAt');
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
  