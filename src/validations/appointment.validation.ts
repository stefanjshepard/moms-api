import Joi from 'joi';

// Constants for validation
const VALID_STATES = ['pending', 'confirmed', 'cancelled'] as const;
const PHONE_REGEX = /^\+?1?\d{9,15}$/; // Basic international phone format
const MIN_SCHEDULING_HOURS = 24; // Minimum hours in advance for booking

// Validation schema for creating/updating an appointment
export const appointmentSchema = Joi.object({
  clientFirstName: Joi.string()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.empty': 'First name is required',
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name cannot exceed 50 characters',
      'any.required': 'First name is required'
    }),

  clientLastName: Joi.string()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.empty': 'Last name is required',
      'string.min': 'Last name must be at least 2 characters long',
      'string.max': 'Last name cannot exceed 50 characters',
      'any.required': 'Last name is required'
    }),

  email: Joi.string()
    .email({ 
      minDomainSegments: 2,
      tlds: { 
        allow: ['com', 'net', 'org', 'edu', 'gov', 'co', 'io', 'dev'] 
      }
    })
    .required()
    .messages({
      'string.empty': 'Email is required',
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),

  phone: Joi.string()
    .pattern(PHONE_REGEX)
    .required()
    .messages({
      'string.empty': 'Phone number is required',
      'string.pattern.base': 'Please provide a valid phone number (e.g., +1234567890)',
      'any.required': 'Phone number is required'
    }),

  date: Joi.date()
    .min(new Date(Date.now() + MIN_SCHEDULING_HOURS * 60 * 60 * 1000)) // Minimum 24 hours in advance
    .required()
    .messages({
      'date.base': 'Please provide a valid date',
      'date.min': 'Appointments must be scheduled at least 24 hours in advance',
      'any.required': 'Appointment date is required'
    }),

  serviceId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.empty': 'Service ID is required',
      'string.guid': 'Service ID must be a valid UUID',
      'any.required': 'Service ID is required'
    }),

  states: Joi.string()
    .valid(...VALID_STATES)
    .default('pending')
    .messages({
      'any.only': 'Status must be one of: pending, confirmed, or cancelled'
    })
});

// Schema for updating appointments (serviceId not required)
export const appointmentUpdateSchema = Joi.object({
  clientFirstName: Joi.string()
    .min(2)
    .max(50)
    .messages({
      'string.empty': 'First name is required',
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name cannot exceed 50 characters'
    }),

  clientLastName: Joi.string()
    .min(2)
    .max(50)
    .messages({
      'string.empty': 'Last name is required',
      'string.min': 'Last name must be at least 2 characters long',
      'string.max': 'Last name cannot exceed 50 characters'
    }),

  email: Joi.string()
    .email({ 
      minDomainSegments: 2,
      tlds: { 
        allow: ['com', 'net', 'org', 'edu', 'gov', 'co', 'io', 'dev'] 
      }
    })
    .messages({
      'string.empty': 'Email is required',
      'string.email': 'Please provide a valid email address'
    }),

  phone: Joi.string()
    .pattern(PHONE_REGEX)
    .messages({
      'string.empty': 'Phone number is required',
      'string.pattern.base': 'Please provide a valid phone number (e.g., +1234567890)'
    }),

  date: Joi.date()
    .min(new Date(Date.now() + MIN_SCHEDULING_HOURS * 60 * 60 * 1000)) // Minimum 24 hours in advance
    .messages({
      'date.base': 'Please provide a valid date',
      'date.min': 'Appointments must be scheduled at least 24 hours in advance'
    }),

  states: Joi.string()
    .valid(...VALID_STATES)
    .messages({
      'any.only': 'Status must be one of: pending, confirmed, or cancelled'
    })
}).min(1); // At least one field must be provided

// Additional schema for appointment confirmation (future use with payment integration)
export const appointmentConfirmationSchema = Joi.object({
  appointmentId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.empty': 'Appointment ID is required',
      'string.guid': 'Appointment ID must be a valid UUID',
      'any.required': 'Appointment ID is required'
    }),

  paymentStatus: Joi.string()
    .valid('completed', 'pending', 'failed')
    .required()
    .messages({
      'any.only': 'Payment status must be one of: completed, pending, or failed',
      'any.required': 'Payment status is required'
    })
});

// Validation middleware for appointments
export const validateAppointment = (req: any, res: any, next: any) => {
  const { error } = appointmentSchema.validate(req.body, { 
    abortEarly: false,
    // Allow unknown keys for future extensibility
    allowUnknown: true
  });
  
  if (error) {
    const errorMessage = error.details.map((detail) => detail.message).join(', ');
    return res.status(400).json({ error: errorMessage });
  }
  
  next();
};

// Validation middleware for appointment updates
export const validateAppointmentUpdate = (req: any, res: any, next: any) => {
  const { error } = appointmentUpdateSchema.validate(req.body, { 
    abortEarly: false,
    allowUnknown: true
  });
  
  if (error) {
    const errorMessage = error.details.map((detail) => detail.message).join(', ');
    return res.status(400).json({ error: errorMessage });
  }
  
  next();
};

// Validation middleware for appointment confirmation
export const validateAppointmentConfirmation = (req: any, res: any, next: any) => {
  const { error } = appointmentConfirmationSchema.validate(req.body, { 
    abortEarly: false
  });
  
  if (error) {
    const errorMessage = error.details.map((detail) => detail.message).join(', ');
    return res.status(400).json({ error: errorMessage });
  }
  
  next();
}; 