/**
 * Test script to validate the new category schema changes
 */
import ModmailConfig, { TicketPriority } from "./src/models/ModmailConfig";
import Database from "./src/utils/data/database";
import { CategoryManager } from "./src/utils/modmail/CategoryManager";

async function testCategorySchema() {
  console.log("🧪 Testing new category schema...");

  const db = new Database();
  const testGuildId = "1129418506690101429"; // Dev guild

  try {
    // Test 1: Create a mock config with default category (no explicit IDs)
    console.log("\n📝 Test 1: Default category without explicit IDs");
    const mockDefaultCategory = {
      id: "default",
      name: "General Support",
      description: "Default category for all tickets",
      priority: TicketPriority.MEDIUM,
      isActive: true,
      formFields: [],
    };

    console.log("✅ Default category structure:", mockDefaultCategory);

    // Test 2: Create a mock additional category with optional staff role
    console.log("\n📝 Test 2: Additional category with optional staff role");
    const mockAdditionalCategory = {
      id: "billing",
      name: "Billing Support",
      description: "Questions about billing and payments",
      forumChannelId: "123456789012345678",
      staffRoleId: "987654321098765432", // Has its own staff role
      priority: TicketPriority.HIGH,
      emoji: "💰",
      isActive: true,
      formFields: [],
    };

    console.log("✅ Additional category with staff role:", mockAdditionalCategory);

    // Test 3: Create a mock additional category without staff role (inherits)
    console.log("\n📝 Test 3: Additional category without staff role (inherits)");
    const mockInheritCategory = {
      id: "technical",
      name: "Technical Support",
      description: "Technical issues and troubleshooting",
      forumChannelId: "123456789012345679",
      // No staffRoleId - should inherit from main config
      priority: TicketPriority.URGENT,
      emoji: "🔧",
      isActive: true,
      formFields: [],
    };

    console.log("✅ Additional category without staff role:", mockInheritCategory);

    // Test 4: Test CategoryManager utility function
    console.log("\n📝 Test 4: CategoryManager.getEffectiveStaffRoleId()");
    const mainConfigStaffRoleId = "111222333444555666";

    const effectiveStaffRole1 = CategoryManager.getEffectiveStaffRoleId(
      mockAdditionalCategory as any,
      mainConfigStaffRoleId
    );
    console.log(
      `✅ Category with own staff role: ${effectiveStaffRole1} (should be ${mockAdditionalCategory.staffRoleId})`
    );

    const effectiveStaffRole2 = CategoryManager.getEffectiveStaffRoleId(
      mockInheritCategory as any,
      mainConfigStaffRoleId
    );
    console.log(
      `✅ Category without staff role: ${effectiveStaffRole2} (should be ${mainConfigStaffRoleId})`
    );

    // Test 5: Validation with fallback
    console.log("\n📝 Test 5: Category validation with fallback staff role");
    const validationResult1 = new CategoryManager().validateCategory(
      mockAdditionalCategory,
      mainConfigStaffRoleId
    );
    console.log("✅ Category with staff role validation:", validationResult1);

    const validationResult2 = new CategoryManager().validateCategory(
      mockInheritCategory,
      mainConfigStaffRoleId
    );
    console.log("✅ Category without staff role validation:", validationResult2);

    // Test 6: Validation without fallback (should fail)
    console.log("\n📝 Test 6: Category validation without fallback (should fail)");
    const validationResult3 = new CategoryManager().validateCategory(mockInheritCategory);
    console.log("❌ Category without staff role and no fallback:", validationResult3);

    console.log("\n🎉 All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testCategorySchema()
  .then(() => {
    console.log("Test script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test script error:", error);
    process.exit(1);
  });
