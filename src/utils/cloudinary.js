const cloud = require("cloudinary");
const fs = require("fs");

const cloudinary = cloud.v2;

cloudinary.config({
	cloud_name: "dkebrpusv",
	api_key: "879664742748191",
	api_secret: "bn9tttgjc8XAVsbjzYD6RjKsYas",
});

const uploadOnCloudinary = async (localFilePath) => {
	try {
		if (!localFilePath) return null;
		//upload the file on cloudinary
		const response = await cloudinary.uploader.upload(localFilePath, {
			resource_type: "auto",
		});
		// file has been uploaded successfull
		// console.log("file is uploaded on cloudinary ", response.url);
		fs.unlinkSync(localFilePath);
		return response;
	} catch (error) {
		// console.log(error);
		fs.unlinkSync(localFilePath); // remove the locally saved temporary file as the upload operation got failed
		return null;
	}
};

const updateOnCloudinary = async (localFilePath, previousPublicId = null) => {
	try {
		if (!localFilePath) return null;

		// Upload the new file to Cloudinary
		const newResponse = await cloudinary.uploader.upload(localFilePath, {
			resource_type: "auto",
		});

		// If there was a previously saved image, destroy it on Cloudinary
		if (previousPublicId) {
			await cloudinary.uploader.destroy(previousPublicId);
		}

		// Remove the locally saved temporary file
		fs.unlinkSync(localFilePath);

		return newResponse;
	} catch (error) {
		console.error("Error updating image on Cloudinary:", error);

		// Remove the locally saved temporary file as the upload operation failed
		fs.unlinkSync(localFilePath);

		return null;
	}
};
module.exports = { uploadOnCloudinary, updateOnCloudinary };
