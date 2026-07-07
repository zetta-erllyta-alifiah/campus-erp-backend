// *************** IMPORT LIBRARY ***************
const DataLoader = require('dataloader');

// *************** IMPORT MODULE ***************
const { AcademicYearModel } = require('../features/academic/enrollment/academic_year.model');

// *************** LOADER ***************
/**
 * Creates a request-scoped DataLoader
 * for batching academic year fetches.
 *
 * @returns {DataLoader} AcademicYear loader.
 */
function CreateAcademicYearLoader() {
  return new DataLoader(async (keys) => {
    const academicYears = await AcademicYearModel.find({ _id: { $in: keys } });
    const academicYearMap = new Map(academicYears.map((academicYear) => [String(academicYear._id), academicYear]));

    return keys.map((key) => {
      const value = academicYearMap.get(String(key));
      if (!value) return null;
      return value;
    });
  });
}

// *************** EXPORT MODULE ***************
module.exports = {
  CreateAcademicYearLoader,
};
