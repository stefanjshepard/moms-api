import Joi from 'joi';

// Validation schema for creating/updating a service
export const serviceSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Title is required',
      'string.min': 'Title must be at least 3 characters long',
      'string.max': 'Title cannot exceed 100 characters',
      'any.required': 'Title is required'
    }),

  description: Joi.string()
    .min(20)
    .max(1000)
    .required()
    .messages({
      'string.empty': 'Description is required',
      'string.min': 'Description must be at least 20 characters long',
      'string.max': 'Description cannot exceed 1000 characters',
      'any.required': 'Description is required'
    }),

  price: Joi.number()
    .min(0)
    .custom((value, helpers) => {
      if (value.toString().split('.')[1]?.length > 2) {
        return helpers.error('number.precision');
      }
      return value;
    })
    .required()
    .messages({
      'number.base': 'Price must be a number',
      'number.min': 'Price cannot be negative',
      'number.precision': 'Price can have at most 2 decimal places',
      'any.required': 'Price is required'
    }),

  durationMinutes: Joi.number()
    .integer()
    .min(15)
    .max(240)
    .default(60)
    .messages({
      'number.base': 'Duration must be a number of minutes',
      'number.integer': 'Duration must be a whole number of minutes',
      'number.min': 'Duration must be at least 15 minutes',
      'number.max': 'Duration cannot exceed 240 minutes'
    }),

  bufferMinutes: Joi.number()
    .integer()
    .min(0)
    .max(60)
    .default(15)
    .messages({
      'number.base': 'Buffer must be a number of minutes',
      'number.integer': 'Buffer must be a whole number of minutes',
      'number.min': 'Buffer cannot be negative',
      'number.max': 'Buffer cannot exceed 60 minutes'
    }),

  clientId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.empty': 'Client ID is required',
      'string.guid': 'Client ID must be a valid UUID',
      'any.required': 'Client ID is required'
    })
});

// Validation middleware
export const validateService = (req: any, res: any, next: any) => {
  const { error } = serviceSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errorMessage = error.details.map((detail) => detail.message).join(', ');
    return res.status(400).json({ error: errorMessage });
  }
  
  next();
}; 