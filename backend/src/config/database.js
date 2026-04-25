import mongoose from "mongoose";

export const connectDatabase = async (mongodbUri) => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongodbUri);
};
