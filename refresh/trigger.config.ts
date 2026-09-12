export default {
  project: process.env.TRIGGER_PROJECT_ID ?? "proj_website_refresh",
  runtime: "node",
  dirs: ["./workflows"],
};
