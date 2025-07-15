import { InferSchemaType, Schema, model } from "mongoose";

const FivemJob = new Schema({
  name: { type: String, required: true },
  maxGrade: { type: Number, required: true },
});

export default model("FivemJob", FivemJob);

export type FivemJobsType = InferSchemaType<typeof FivemJob>;
