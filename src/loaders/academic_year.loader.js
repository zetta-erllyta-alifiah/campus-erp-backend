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
    // *************** Fetch all requested academic years in one database query
    const academicYears = await AcademicYearModel.find({ _id: { $in: keys } });

    // *************** Index academic year documents by ID for constant-time lookup
    const academicYearMap = new Map(academicYears.map((academicYear) => [String(academicYear._id), academicYear]));

    // *************** Return results in the same order as the requested loader keys
    return keys.map((key) => {
      const value = academicYearMap.get(String(key));

      // *************** Preserve DataLoader position with null when a record is missing
      if (!value) return null;

      return value;
    });
  });
}

// *************** EXPORT MODULE ***************
module.exports = {
  CreateAcademicYearLoader,
};
