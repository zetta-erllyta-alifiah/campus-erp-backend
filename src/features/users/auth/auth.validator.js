// *************** IMPORT LIBRARY ***************
const Joi = require('joi');

// *************** GLOBAL VARIABLES ***************
const LoginValidator = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

// *************** EXPORT MODULE ***************
module.exports = {
  LoginValidator,
};
