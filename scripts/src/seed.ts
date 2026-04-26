import { db } from "@workspace/db";
import { usersTable, projectsTable, tasksTable, formulationsTable, notificationsTable, activityLogsTable } from "@workspace/db";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("🌱 Seeding R&D Intelligence Suite database...");

  // Users
  const passwordHash = await bcrypt.hash("admin123", 10);
  const scientistHash = await bcrypt.hash("scientist123", 10);

  const users = await db.insert(usersTable).values([
    { email: "admin@rnd.com", name: "Sarah Chen", role: "admin", department: "R&D Leadership", passwordHash, isActive: true },
    { email: "manager@rnd.com", name: "James Morrison", role: "manager", department: "Product Development", passwordHash: await bcrypt.hash("manager123", 10), isActive: true },
    { email: "alice@rnd.com", name: "Alice Thompson", role: "scientist", department: "Formulation Science", passwordHash: scientistHash, isActive: true },
    { email: "bob@rnd.com", name: "Bob Kumar", role: "scientist", department: "Food Technology", passwordHash: scientistHash, isActive: true },
    { email: "carol@rnd.com", name: "Carol White", role: "analyst", department: "Data Analytics", passwordHash: await bcrypt.hash("analyst123", 10), isActive: true },
    { email: "david@rnd.com", name: "David Park", role: "scientist", department: "Sensory Science", passwordHash: scientistHash, isActive: true },
    { email: "eva@rnd.com", name: "Eva Martinez", role: "manager", department: "Regulatory Affairs", passwordHash: await bcrypt.hash("manager123", 10), isActive: true },
    { email: "frank@rnd.com", name: "Frank Liu", role: "viewer", department: "Sales", passwordHash: await bcrypt.hash("viewer123", 10), isActive: true },
  ]).returning();

  console.log(`✅ Created ${users.length} users`);

  // Projects
  const projects = await db.insert(projectsTable).values([
    {
      name: "PlantBurger Pro 2.0",
      description: "Next-gen plant-based burger with improved texture and meat-like experience",
      stage: "testing",
      status: "active",
      priority: "critical",
      leadId: users[2].id,
      startDate: new Date("2025-11-01"),
      targetDate: new Date("2026-06-15"),
      successRate: "72.5",
      revenueImpact: "2500000",
      productCategory: "Plant-Based Proteins",
      tags: ["plant-based", "protein", "burger", "texture"],
    },
    {
      name: "HealthBar Omega-3 Fusion",
      description: "Functional snack bar enriched with marine-derived omega-3 and antioxidants",
      stage: "formulation",
      status: "active",
      priority: "high",
      leadId: users[3].id,
      startDate: new Date("2026-01-10"),
      targetDate: new Date("2026-09-30"),
      successRate: "58.0",
      revenueImpact: "1200000",
      productCategory: "Functional Snacks",
      tags: ["omega-3", "functional", "snack", "health"],
    },
    {
      name: "GlutenFree Pasta Artisan",
      description: "Artisan-quality gluten-free pasta using ancient grain blend",
      stage: "validation",
      status: "active",
      priority: "high",
      leadId: users[5].id,
      startDate: new Date("2025-09-01"),
      targetDate: new Date("2026-04-30"),
      successRate: "81.0",
      revenueImpact: "850000",
      productCategory: "Gluten-Free",
      tags: ["gluten-free", "pasta", "ancient-grain", "artisan"],
    },
    {
      name: "ProbioticDrink Kefir Plus",
      description: "Enhanced kefir drink with proprietary multi-strain probiotic blend",
      stage: "scale_up",
      status: "active",
      priority: "high",
      leadId: users[2].id,
      startDate: new Date("2025-06-01"),
      targetDate: new Date("2026-03-31"),
      successRate: "88.5",
      revenueImpact: "3200000",
      productCategory: "Dairy & Fermented",
      tags: ["probiotic", "kefir", "fermented", "functional"],
    },
    {
      name: "LowSugar Kids Cereal",
      description: "Fun-shaped breakfast cereal with 60% less sugar and added vitamins",
      stage: "research",
      status: "active",
      priority: "medium",
      leadId: users[3].id,
      startDate: new Date("2026-02-01"),
      targetDate: new Date("2026-12-31"),
      successRate: null,
      revenueImpact: "1800000",
      productCategory: "Breakfast Cereals",
      tags: ["low-sugar", "kids", "breakfast", "cereal", "fortified"],
    },
    {
      name: "VeganCheese Aged Cheddar",
      description: "Aged vegan cheddar-style cheese using cashew and fermentation technology",
      stage: "commercialization",
      status: "completed",
      priority: "medium",
      leadId: users[6].id,
      startDate: new Date("2025-01-01"),
      targetDate: new Date("2025-12-31"),
      successRate: "93.5",
      revenueImpact: "2100000",
      productCategory: "Plant-Based Dairy",
      tags: ["vegan", "cheese", "fermented", "cashew"],
    },
    {
      name: "Superfood Smoothie Base",
      description: "Concentrated smoothie base with spirulina, maca and adaptogenic herbs",
      stage: "ideation",
      status: "active",
      priority: "low",
      leadId: users[4].id,
      startDate: new Date("2026-03-01"),
      targetDate: new Date("2027-01-31"),
      successRate: null,
      revenueImpact: "650000",
      productCategory: "Beverages",
      tags: ["superfood", "smoothie", "adaptogen", "spirulina"],
    },
    {
      name: "SpicySnack Hot Sauce Crisps",
      description: "Crinkle-cut crisps with fermented hot sauce seasoning blend",
      stage: "testing",
      status: "on_hold",
      priority: "medium",
      leadId: users[3].id,
      startDate: new Date("2025-10-01"),
      targetDate: new Date("2026-08-31"),
      successRate: "45.0",
      revenueImpact: "950000",
      productCategory: "Savory Snacks",
      tags: ["spicy", "crisps", "hot-sauce", "fermented"],
    },
  ]).returning();

  console.log(`✅ Created ${projects.length} projects`);

  // Tasks
  const tasks = await db.insert(tasksTable).values([
    { projectId: projects[0].id, title: "Complete sensory panel testing (n=50)", status: "in_progress", priority: "critical", assigneeId: users[5].id, dueDate: new Date("2026-04-15") },
    { projectId: projects[0].id, title: "Optimize soy protein binding agent ratio", status: "done", priority: "high", assigneeId: users[2].id, dueDate: new Date("2026-03-01") },
    { projectId: projects[0].id, title: "Stability testing at 3 temperature conditions", status: "todo", priority: "high", assigneeId: users[3].id, dueDate: new Date("2026-05-01") },
    { projectId: projects[0].id, title: "Prepare regulatory dossier", status: "todo", priority: "medium", assigneeId: users[6].id, dueDate: new Date("2026-05-30") },
    { projectId: projects[0].id, title: "Consumer focus group session", status: "in_progress", priority: "high", assigneeId: users[4].id, dueDate: new Date("2026-04-30") },
    { projectId: projects[1].id, title: "Source sustainable omega-3 supplier", status: "done", priority: "high", assigneeId: users[2].id, dueDate: new Date("2026-02-28") },
    { projectId: projects[1].id, title: "Formulate base recipe v1.0", status: "done", priority: "critical", assigneeId: users[3].id, dueDate: new Date("2026-03-15") },
    { projectId: projects[1].id, title: "Masking fishy off-notes - round 2", status: "in_progress", priority: "critical", assigneeId: users[2].id, dueDate: new Date("2026-04-15") },
    { projectId: projects[1].id, title: "Shelf-life accelerated aging study", status: "todo", priority: "high", assigneeId: users[5].id, dueDate: new Date("2026-05-30") },
    { projectId: projects[2].id, title: "Ancient grain sourcing and qualification", status: "done", priority: "high", assigneeId: users[3].id, dueDate: new Date("2026-01-31") },
    { projectId: projects[2].id, title: "Texture optimization - final validation", status: "in_progress", priority: "critical", assigneeId: users[5].id, dueDate: new Date("2026-04-01") },
    { projectId: projects[2].id, title: "Nutritional profile analysis and labeling", status: "review", priority: "medium", assigneeId: users[4].id, dueDate: new Date("2026-03-31") },
    { projectId: projects[3].id, title: "Scale-up trial at pilot plant (500L batch)", status: "in_progress", priority: "critical", assigneeId: users[2].id, dueDate: new Date("2026-04-15") },
    { projectId: projects[3].id, title: "Probiotic viability testing post-pasteurization", status: "done", priority: "high", assigneeId: users[5].id, dueDate: new Date("2026-03-01") },
    { projectId: projects[3].id, title: "Packaging compatibility testing", status: "review", priority: "medium", assigneeId: users[3].id, dueDate: new Date("2026-04-30") },
  ]).returning();

  console.log(`✅ Created ${tasks.length} tasks`);

  // Formulations
  const formulations = await db.insert(formulationsTable).values([
    {
      projectId: projects[0].id,
      name: "PlantBurger Pro v3.2",
      version: "3.2",
      ingredients: [
        { name: "Pea Protein Isolate", percentage: 28, costPerKg: 8.50, supplier: "Roquette" },
        { name: "Soy Protein Concentrate", percentage: 12, costPerKg: 4.20, supplier: "ADM" },
        { name: "Methylcellulose", percentage: 1.5, costPerKg: 22.00, supplier: "Dow Chemical" },
        { name: "Coconut Oil", percentage: 8, costPerKg: 3.80, supplier: "Local Supplier" },
        { name: "Beet Juice Extract", percentage: 2, costPerKg: 15.00, supplier: "Chr. Hansen" },
        { name: "Natural Flavors", percentage: 1.2, costPerKg: 45.00, supplier: "Givaudan" },
        { name: "Rice Starch", percentage: 6, costPerKg: 1.80, supplier: "Beneo" },
        { name: "Water", percentage: 38.3, costPerKg: 0.01, supplier: "Internal" },
        { name: "Salt & Minerals", percentage: 3, costPerKg: 2.00, supplier: "Internal" },
      ],
      sensoryScores: { taste: 7.8, texture: 8.2, appearance: 8.5, aroma: 7.2, overall: 7.9 },
      shelfLifeDays: 21,
      costPerUnit: "4.85",
      targetMargin: "42",
      status: "active",
      createdById: users[2].id,
    },
    {
      projectId: projects[0].id,
      name: "PlantBurger Pro v3.1",
      version: "3.1",
      ingredients: [
        { name: "Pea Protein Isolate", percentage: 25, costPerKg: 8.50, supplier: "Roquette" },
        { name: "Soy Protein Concentrate", percentage: 15, costPerKg: 4.20, supplier: "ADM" },
        { name: "Methylcellulose", percentage: 2.0, costPerKg: 22.00, supplier: "Dow Chemical" },
        { name: "Coconut Oil", percentage: 10, costPerKg: 3.80, supplier: "Local Supplier" },
        { name: "Water", percentage: 45, costPerKg: 0.01, supplier: "Internal" },
        { name: "Natural Flavors", percentage: 3, costPerKg: 45.00, supplier: "Givaudan" },
      ],
      sensoryScores: { taste: 7.1, texture: 7.5, appearance: 8.0, aroma: 6.8, overall: 7.4 },
      shelfLifeDays: 18,
      costPerUnit: "4.65",
      targetMargin: "40",
      status: "rejected",
      createdById: users[2].id,
    },
    {
      projectId: projects[1].id,
      name: "OmegaBar Base v1.0",
      version: "1.0",
      ingredients: [
        { name: "Oat Base", percentage: 35, costPerKg: 1.20, supplier: "Tate & Lyle" },
        { name: "Marine Omega-3 Oil (EPA/DHA)", percentage: 3, costPerKg: 85.00, supplier: "BASF" },
        { name: "Honey", percentage: 12, costPerKg: 6.50, supplier: "Local Beekeeper" },
        { name: "Almonds", percentage: 15, costPerKg: 14.00, supplier: "Blue Diamond" },
        { name: "Dark Chocolate Chips", percentage: 10, costPerKg: 9.50, supplier: "Barry Callebaut" },
        { name: "Brown Rice Syrup", percentage: 8, costPerKg: 2.80, supplier: "Beneo" },
        { name: "Rosemary Extract (antioxidant)", percentage: 0.08, costPerKg: 180.00, supplier: "Naturex" },
        { name: "Lecithin emulsifier", percentage: 0.3, costPerKg: 5.50, supplier: "ADM" },
        { name: "Natural Vanilla Flavor", percentage: 0.5, costPerKg: 120.00, supplier: "Givaudan" },
        { name: "Salt", percentage: 0.5, costPerKg: 0.50, supplier: "Internal" },
        { name: "Vitamin/Mineral Mix", percentage: 0.62, costPerKg: 95.00, supplier: "DSM" },
        { name: "Water", percentage: 15, costPerKg: 0.01, supplier: "Internal" },
      ],
      sensoryScores: { taste: 6.5, texture: 7.2, appearance: 8.0, aroma: 5.8, overall: 6.9 },
      shelfLifeDays: 180,
      costPerUnit: "2.95",
      targetMargin: "55",
      notes: "Fish oil taste breakthrough issue - needs masking solution",
      status: "draft",
      createdById: users[3].id,
    },
    {
      projectId: projects[2].id,
      name: "GF Pasta Artisan v2.3",
      version: "2.3",
      ingredients: [
        { name: "Brown Rice Flour", percentage: 40, costPerKg: 2.10, supplier: "Beneo" },
        { name: "Quinoa Flour", percentage: 20, costPerKg: 8.50, supplier: "Organic Origin" },
        { name: "Teff Flour", percentage: 10, costPerKg: 12.00, supplier: "Healthy Grains Co" },
        { name: "Tapioca Starch", percentage: 15, costPerKg: 1.90, supplier: "Thailand Import" },
        { name: "Egg Powder", percentage: 5, costPerKg: 14.50, supplier: "Igreca" },
        { name: "Psyllium Husk", percentage: 2, costPerKg: 18.00, supplier: "Benefiber" },
        { name: "Xanthan Gum", percentage: 0.5, costPerKg: 22.00, supplier: "CP Kelco" },
        { name: "Salt", percentage: 1.5, costPerKg: 0.50, supplier: "Internal" },
        { name: "Water", percentage: 6, costPerKg: 0.01, supplier: "Internal" },
      ],
      sensoryScores: { taste: 8.1, texture: 8.6, appearance: 8.8, aroma: 8.0, overall: 8.4 },
      shelfLifeDays: 540,
      costPerUnit: "3.45",
      targetMargin: "48",
      status: "approved",
      createdById: users[5].id,
    },
    {
      projectId: projects[3].id,
      name: "ProbioKefir Formula v4.1",
      version: "4.1",
      ingredients: [
        { name: "Whole Milk", percentage: 75, costPerKg: 0.85, supplier: "Local Dairy" },
        { name: "Kefir Grain Culture (12-strain blend)", percentage: 3, costPerKg: 250.00, supplier: "Chr. Hansen" },
        { name: "Fructooligosaccharides (prebiotic)", percentage: 4, costPerKg: 8.50, supplier: "Beneo" },
        { name: "Milk Protein Concentrate", percentage: 5, costPerKg: 12.00, supplier: "Fonterra" },
        { name: "Natural Fruit Flavor", percentage: 2, costPerKg: 35.00, supplier: "Firmenich" },
        { name: "Pectin (stabilizer)", percentage: 0.5, costPerKg: 15.00, supplier: "CP Kelco" },
        { name: "Vitamin D3 + B12", percentage: 0.1, costPerKg: 450.00, supplier: "DSM" },
        { name: "Water", percentage: 10.4, costPerKg: 0.01, supplier: "Internal" },
      ],
      sensoryScores: { taste: 8.5, texture: 8.8, appearance: 8.2, aroma: 8.0, overall: 8.4 },
      shelfLifeDays: 42,
      costPerUnit: "1.85",
      targetMargin: "62",
      status: "approved",
      createdById: users[2].id,
    },
  ]).returning();

  console.log(`✅ Created ${formulations.length} formulations`);

  // Notifications for admin user
  await db.insert(notificationsTable).values([
    { userId: users[0].id, type: "deadline", title: "Task Due Tomorrow", message: "Sensory panel testing for PlantBurger Pro is due tomorrow. 50 panelists scheduled.", isRead: false, projectId: projects[0].id },
    { userId: users[0].id, type: "update", title: "Formulation Approved", message: "GF Pasta Artisan v2.3 has been approved by the quality team and is ready for scale-up.", isRead: false, projectId: projects[2].id },
    { userId: users[0].id, type: "system", title: "System Update", message: "R&D Intelligence Suite has been updated with new analytics features.", isRead: true },
    { userId: users[0].id, type: "reminder", title: "Monthly Report Due", message: "The monthly R&D progress report is due in 3 days. Please review all project statuses.", isRead: false },
    { userId: users[0].id, type: "update", title: "Project Status Change", message: "ProbioticDrink Kefir Plus has progressed to Scale-Up stage. Scale-up trials begin next week.", isRead: false, projectId: projects[3].id },
    { userId: users[0].id, type: "deadline", title: "Regulatory Submission", message: "Regulatory dossier for PlantBurger Pro must be submitted by May 30, 2026.", isRead: true, projectId: projects[0].id },
    { userId: users[0].id, type: "mention", title: "Comment on Task", message: "Alice Thompson mentioned you in a comment: 'Sarah, can we discuss the binding agent alternatives?'", isRead: false, projectId: projects[0].id },
  ]);

  console.log("✅ Created notifications");

  // Activity logs
  await db.insert(activityLogsTable).values([
    { userId: users[0].id, action: "created", entityType: "project", entityId: projects[0].id, details: "Created project: PlantBurger Pro 2.0" },
    { userId: users[2].id, action: "created", entityType: "formulation", entityId: formulations[0].id, details: "Created formulation: PlantBurger Pro v3.2" },
    { userId: users[5].id, action: "updated", entityType: "task", entityId: tasks[0].id, details: "Started sensory panel testing" },
    { userId: users[1].id, action: "approved", entityType: "formulation", entityId: formulations[3].id, details: "Approved: GF Pasta Artisan v2.3" },
    { userId: users[3].id, action: "created", entityType: "formulation", entityId: formulations[2].id, details: "Created OmegaBar Base v1.0" },
    { userId: users[2].id, action: "updated", entityType: "project", entityId: projects[3].id, details: "Advanced ProbioKefir to Scale-Up stage" },
    { userId: users[4].id, action: "completed", entityType: "task", entityId: tasks[5].id, details: "Completed: Source sustainable omega-3 supplier" },
    { userId: users[0].id, action: "created", entityType: "project", entityId: projects[6].id, details: "Initiated Superfood Smoothie Base project" },
  ]);

  console.log("✅ Created activity logs");
  console.log("\n🎉 Seed complete!");
  console.log("\n📋 Login credentials:");
  console.log("  Admin:     admin@rnd.com / admin123");
  console.log("  Manager:   manager@rnd.com / manager123");
  console.log("  Scientist: alice@rnd.com / scientist123");
  console.log("  Analyst:   carol@rnd.com / analyst123");
}

seed().then(() => process.exit(0)).catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
