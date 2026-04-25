export const errorHandler = (error, _req, res, _next) => {
  if (error?.name === "ZodError") {
    return res.status(400).json({
      message: error.issues?.[0]?.message || "Invalid request payload."
    });
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server error.";

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({ message });
};
