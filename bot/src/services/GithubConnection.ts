import axios from "axios";
import FetchEnvs, { DEFAULT_OPTIONAL_STRING, envExists } from "../utils/FetchEnvs";
import log from "../utils/log";
const env = FetchEnvs();

interface AddItemToProjectMutationResponse {
  data: {
    addProjectV2ItemById: {
      item: {
        id: string;
      };
    };
  };
}

interface UpdateItemFieldMutationResponse {
  data: {
    updateProjectV2ItemFieldValue: {
      projectV2Item: {
        id: string;
      };
    };
  };
}

// Function to get field information for a project
async function getProjectFields(token: string, projectId: string) {
  const query = `
    query {
      node(id: "${projectId}") {
        ... on ProjectV2 {
          fields(first: 20) {
            nodes {
              ... on ProjectV2FieldCommon {
                id
                name
                __typename
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await axios.post(
    "https://api.github.com/graphql",
    { query },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  console.log("Project fields:");
  console.log(JSON.stringify(response.data, null, 2));
  return response.data;
}

// Function to create an issue in a repository
async function createRepoIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string
) {
  try {
    // First check if the repository exists and you have access
    const repoQuery = `
      query {
        repository(owner: "${owner}", name: "${repo}") {
          id
          name
        }
      }
    `;

    const repoResponse = await axios.post(
      "https://api.github.com/graphql",
      { query: repoQuery },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!repoResponse.data.data.repository) {
      console.error(`Repository ${owner}/${repo} not found or no access`);
      throw new Error(`Repository ${owner}/${repo} not found or no access`);
    }

    const repoId = repoResponse.data.data.repository.id; // Then create the issue - using a properly structured mutation with variables
    const mutation = `
      mutation CreateIssue($repositoryId: ID!, $title: String!, $body: String!) {
        createIssue(input: {
          repositoryId: $repositoryId
          title: $title
          body: $body
        }) {
          issue {
            id
            number
            url
          }
        }
      }
    `;
    const response = await axios.post(
      "https://api.github.com/graphql",
      {
        query: mutation,
        variables: {
          repositoryId: repoId,
          title: title,
          body: body,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Created repository issue:");
    console.log(JSON.stringify(response.data, null, 2));

    // Safely access the issue data with proper error checking
    if (!response.data || !response.data.data || !response.data.data.createIssue) {
      console.error("Invalid response format from GitHub API:", response.data);
      throw new Error("Invalid response from GitHub API when creating issue");
    }

    return response.data.data.createIssue.issue;
  } catch (error) {
    console.error("Error creating repository issue:", error);
    throw error;
  }
}

// Function to add item to project board
async function addItemToProjectBoard(
  token: string,
  projectId: string,
  contentId: string
): Promise<string> {
  const addItemMutation = `
    mutation {
      addProjectV2ItemById(input: {
        projectId: "${projectId}"
        contentId: "${contentId}"
      }) {
        item {
          id
        }
      }
    }
  `;

  const addItemResponse = await axios.post<AddItemToProjectMutationResponse>(
    "https://api.github.com/graphql",
    { query: addItemMutation },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  console.log("Added item to project board:");
  console.log(JSON.stringify(addItemResponse.data, null, 2));

  return addItemResponse.data.data.addProjectV2ItemById.item.id;
}

// Function to update item category
export async function updateItemCategory(
  token: string,
  projectId: string,
  itemId: string,
  categoryFieldId: string,
  categoryOptionId: string
): Promise<string> {
  // Update the category field
  const updateCategoryMutation = `
    mutation {
      updateProjectV2ItemFieldValue(input: {
        projectId: "${projectId}"
        itemId: "${itemId}"
        fieldId: "${categoryFieldId}"
        value: { 
          singleSelectOptionId: "${categoryOptionId}"
        }
      }) {
        projectV2Item {
          id
        }
      }
    }
  `;

  const updateResponse = await axios.post<UpdateItemFieldMutationResponse>(
    "https://api.github.com/graphql",
    { query: updateCategoryMutation },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  console.log("Updated item category:");
  console.log(JSON.stringify(updateResponse.data, null, 2));

  return updateResponse.data.data.updateProjectV2ItemFieldValue.projectV2Item.id;
}

/**
 * Creates a GitHub issue and adds it to a project board
 * @param title The title of the issue
 * @param description The description (body) of the issue
 * @returns An object containing information about the created issue, or null if there was an error
 */
export async function createGitHubIssue(
  title: string,
  description: string,
  categoryName?: string
): Promise<{
  issueId: string;
  issueNumber: number;
  issueUrl: string;
  projectItemId: string;
} | null> {
  if (!envExists(env.GITHUB_TOKEN)) return null;

  // Get required environment variables
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_ISSUES_REPO;
  const projectId = env.GITHUB_PROJECT_ID;
  categoryName = categoryName || env.GITHUB_PROJECT_FIELD || "Suggestions"; // Default to "Suggestions"

  // Replace double quotes in title and description
  title = title.replace(/"/g, "'");
  description = description.replace(/"/g, "'");

  // Escape special characters in title and description
  title = title.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  description = description.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  // Default organization name (from repository format: "org/repo")
  const repoSplit = repo.split("/");
  if (repoSplit.length !== 2) {
    log.error(`Invalid repository format: ${repo}. Expected format: "organization/repository"`);
    return null;
  }
  const organization = repoSplit[0];
  const repository = repoSplit[1];

  // Verify required variables are present
  if (!token || token === DEFAULT_OPTIONAL_STRING) {
    log.error("GITHUB_TOKEN not set in environment variables");
    return null;
  }

  if (!repo || repo === DEFAULT_OPTIONAL_STRING) {
    log.error("GITHUB_ISSUES_REPO not set in environment variables");
    return null;
  }

  if (!projectId || projectId === DEFAULT_OPTIONAL_STRING) {
    log.error("GITHUB_PROJECT_ID not set in environment variables");
    return null;
  }

  try {
    // Step 1: Get project fields to find the Status field and its options
    const projectData = await getProjectFields(token, projectId);

    // Find the Status field
    const fields = projectData.data.node.fields.nodes;
    const statusField = fields.find(
      (field: any) => field.__typename === "ProjectV2SingleSelectField" && field.name === "Status"
    );

    if (!statusField) {
      log.error(`Could not find Status field in project`);
      return null;
    }

    // Choose the category option (default to Suggestions)
    const categoryOptionId = statusField.options.find((opt: any) => opt.name === categoryName)?.id;

    if (!categoryOptionId) {
      log.error(`Could not find the "${categoryName}" option in Status field`);
      log.debug(`Available options: ${statusField.options.map((opt: any) => opt.name).join(", ")}`);
      return null;
    }

    // Step 2: Create the issue in the repository
    log.debug(`Creating issue "${title}" in ${organization}/${repository}`);
    const issue = await createRepoIssue(token, organization, repository, title, description);

    log.debug(`Created issue #${issue.number} with ID ${issue.id}`);

    // Step 3: Add the issue to the project
    log.debug(`Adding issue to project ${projectId}`);
    const projectItemId = await addItemToProjectBoard(token, projectId, issue.id);

    log.debug(`Added issue to project, item ID: ${projectItemId}`);

    // Step 4: Set the status to the specified category
    log.debug(`Setting issue status to ${categoryName}`);
    await updateItemCategory(token, projectId, projectItemId, statusField.id, categoryOptionId);

    log.debug(`Successfully added issue #${issue.number} to project board under ${categoryName}`);

    return {
      issueId: issue.id,
      issueNumber: issue.number,
      issueUrl: issue.url,
      projectItemId: projectItemId,
    };
  } catch (error: any) {
    log.error("Error creating GitHub issue:", error);

    // Extract more detailed error information if available
    if (error.response && error.response.data) {
      log.error("GitHub API error details:", error.response.data);
    }

    return null;
  }
}

// Run the test function when the file is executed directly
if (require.main === module) {
  console.log("Running GitHub Project API test...");
  createGitHubIssue(
    "Test Issue from Bot API",
    "This is a test issue created by the bot to demonstrate GitHub API integration."
  )
    .then((result) => {
      if (result) {
        console.log("Test completed successfully:", result);
      } else {
        console.log("Test failed.");
      }
    })
    .catch((error) => {
      console.error("Error in test function:", error);
    });
}
