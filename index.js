// Application State

const state = {
  nodes: [
    {
      id: 1000,
      name: "Start",
      metadata:
        'console.log("Starting Node 1000");\nopenNewTab("https://yts.bz/");\nglobalVars.set("next", "next");\n\n console.log("End of Node 1000");',
      branches: [{ conditionValue: "next", next: 1001 }],
      x: 0,
      y: 0,
    },
    {
      id: 1001,
      name: "Success Logger",
      metadata:
        'console.log("Running Node 1001");\n//Code here \n\n\nconsole.log("End of Node 1001");',
      branches: [],
      x: 0,
      y: 0,
    },
  ],
  nextIdCounter: 1002,
};
const default_state={...state};

const initial_state = JSON.parse(JSON.stringify(state));
let activeNodeId = null;
let activeEditorInstance = null;

const inbuiltFunctions = [
  {
    label: "openNewTab",
    insertText: "openNewTab('${1:url}');",
    detail: "openNewTab(url)",
  },
  {
    label: "window.globalVars.set",
    insertText: "window.globalVars.set('${1:key}', ${2:value});",
    detail: "globalVars.set(key, val)",
  },
  {
    label: "window.globalVars.get",
    insertText: "await window.globalVars.get('${1:key}');",
    detail: "globalVars.get(key)",
  },
  { label: "sleep", insertText: "sleep(${1:ms});", detail: "sleep(ms)" },
  {
    label: "console.log",
    insertText: "console.log(${1:msg});",
    detail: "console.log(msg)",
  },
];

const treeContainer = document.getElementById("tree-container");
const jsonPreview = document.getElementById("json-preview");
const workspace = document.querySelector(".canvas-workspace");

// Verify and build configuration drawer infrastructure
let editDrawer = document.getElementById("edit-drawer");
if (!editDrawer) {
  editDrawer = document.createElement("div");
  editDrawer.id = "edit-drawer";
  editDrawer.className = "edit-drawer";
  editDrawer.innerHTML = `
    <div class="drawer-header">
      <h3 id="drawer-title">Configure Node</h3>
      <button id="close-drawer-btn" class="btn close-btn">×</button>
    </div>
    <div id="drawer-body" class="drawer-body"></div>
  `;
  document.querySelector(".app-container").appendChild(editDrawer);
}

const drawerBody = document.getElementById("drawer-body");
const drawerTitle = document.getElementById("drawer-title");
const closeDrawerBtn = document.getElementById("close-drawer-btn");

const canvas = document.createElement("canvas");
canvas.id = "arrow-canvas";
workspace.appendChild(canvas);
const ctx = canvas.getContext("2d");

// Geometric Constants for Auto-Layout Engine
const NODE_WIDTH = 190;
const NODE_HEIGHT = 50;
const VERTICAL_SPACING = 150;
const COMPACT_HORIZONTAL_GAP = 230;

require.config({
  paths: {
    vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs",
  },
});

function init() {
  require(["vs/editor/editor.main"], function () {
    monaco.languages.registerCompletionItemProvider("javascript", {
      provideCompletionItems: function (model, position) {
        const suggestions = inbuiltFunctions.map((fn) => ({
          label: fn.label,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: fn.insertText,
          insertTextRules:
            monaco.languages.CompletionItemInsertRule.InsertAsSnippet,
          detail: fn.detail,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: model.getWordUntilPosition(position).startColumn,
            endColumn: position.column,
          },
        }));
        return { suggestions: suggestions };
      },
    });

    closeDrawerBtn.addEventListener("click", closeDrawer);
    window.addEventListener("resize", () => {
      calculateAutoTreeLayout();
      drawArrows();
    });

    calculateAutoTreeLayout();
    render();
  });
}

function calculateAutoTreeLayout() {
  if (state.nodes.length === 0) return;
  const workspaceWidth = workspace.clientWidth || 800;

  const parentOf = {};
  state.nodes.forEach((node) => {
    node.branches.forEach((branch) => {
      if (branch.next !== null) {
        if (!parentOf[branch.next]) parentOf[branch.next] = [];
        parentOf[branch.next].push(node.id);
      }
    });
  });

  const levels = {};
  function assignLevel(nodeId, currentLevel) {
    levels[nodeId] = Math.max(levels[nodeId] || 0, currentLevel);
    const node = state.nodes.find((n) => n.id === nodeId);
    if (node) {
      node.branches.forEach((branch) => {
        if (branch.next !== null && branch.next !== nodeId) {
          assignLevel(branch.next, currentLevel + 1);
        }
      });
    }
  }

  const roots = state.nodes.filter((n) => !parentOf[n.id]);
  if (roots.length === 0 && state.nodes.length > 0) roots.push(state.nodes[0]);
  roots.forEach((root) => assignLevel(root.id, 0));

  state.nodes.forEach((n) => {
    if (levels[n.id] === undefined) levels[n.id] = 0;
  });

  const levelGroups = {};
  state.nodes.forEach((node) => {
    const lvl = levels[node.id];
    if (!levelGroups[lvl]) levelGroups[lvl] = [];
    levelGroups[lvl].push(node);
  });

  Object.keys(levelGroups).forEach((lvlStr) => {
    const lvl = parseInt(lvlStr, 10);
    if (lvl === 0) return;

    levelGroups[lvl].sort((a, b) => {
      const pA = parentOf[a.id] ? parentOf[a.id][0] : 0;
      const pB = parentOf[b.id] ? parentOf[b.id][0] : 0;
      if (pA !== pB) return pA - pB;

      const parentNode = state.nodes.find((n) => n.id === pA);
      if (parentNode) {
        const idxA = parentNode.branches.findIndex((br) => br.next === a.id);
        const idxB = parentNode.branches.findIndex((br) => br.next === b.id);
        return idxA - idxB;
      }
      return a.id - b.id;
    });
  });

  Object.keys(levelGroups).forEach((lvlStr) => {
    const lvl = parseInt(lvlStr, 10);
    const rowNodes = levelGroups[lvl];
    const count = rowNodes.length;
    const rowY = 50 + lvl * VERTICAL_SPACING;

    const totalRowWidth = (count - 1) * COMPACT_HORIZONTAL_GAP;
    const startX = workspaceWidth / 2 - totalRowWidth / 2 - NODE_WIDTH / 2;

    rowNodes.forEach((node, index) => {
      node.y = rowY;
      node.x = startX + index * COMPACT_HORIZONTAL_GAP;
      if (node.x < 30) node.x = 30;
    });
  });
}

function createNewNode(customId = null) {
  const newId = customId || state.nextIdCounter++;
  const newNode = {
    id: newId,
    name: `Node Task ${newId}`,
    metadata: `console.log("Running Node ${newId}");\n //Code here\n\nconsole.log("End of Node ${newId}");`,
    branches: [],
    x: 0,
    y: 0,
  };
  state.nodes.push(newNode);
  calculateAutoTreeLayout();
  render();
  return newNode;
}

function addChildNode(parentId) {
  const parentNode = state.nodes.find((n) => n.id === parentId);
  if (!parentNode) return;

  const childId = state.nextIdCounter++;
  createNewNode(childId);

  parentNode.branches.push({ conditionValue: "Next", next: childId });

  calculateAutoTreeLayout();
  render();
  openDrawer(parentId);
}

function deleteNode(id) {
  if (hasChildNodes(id)) {
    alert(
      "Prohibited Action: Cannot delete a node that contains active sub-child connections.",
    );
    return;
  }

  state.nodes = state.nodes.filter((node) => node.id !== id);
  state.nodes.forEach((node) => {
    node.branches = node.branches.filter((b) => b.next !== id);
  });
  if (activeNodeId === id) closeDrawer();
  calculateAutoTreeLayout();
  render();
}

function hasChildNodes(nodeId) {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (node && node.branches.some((b) => b.next !== null)) {
    return true;
  }
  return false;
}

function addBranch(nodeId) {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (node) {
    node.branches.push({ conditionValue: "Next", next: null });
    render();
    openDrawer(nodeId);
  }
}

function deleteBranch(nodeId, branchIndex) {
  // Guard check just in case, though the UI button will now be disabled
  if (wouldSplitTree(nodeId, branchIndex)) return;

  const node = state.nodes.find((n) => n.id === nodeId);
  if (node && node.branches[branchIndex] !== undefined) {
    node.branches.splice(branchIndex, 1);
    calculateAutoTreeLayout();
    render();
    openDrawer(nodeId);
  }
}

function wouldSplitTree(nodeId, branchIndex) {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node || !node.branches[branchIndex]) return false;

  const targetNodeId = node.branches[branchIndex].next;
  if (targetNodeId === null) return false;

  const allTargets = new Set();
  state.nodes.forEach((n) => {
    n.branches.forEach((b) => {
      if (b.next !== null) allTargets.add(b.next);
    });
  });
  const rootNode =
    state.nodes.find((n) => !allTargets.has(n.id)) || state.nodes[0];
  if (!rootNode) return false;

  const visited = new Set();
  const queue = [rootNode.id];
  visited.add(rootNode.id);

  while (queue.length > 0) {
    const currId = queue.shift();
    const currNode = state.nodes.find((n) => n.id === currId);
    if (!currNode) continue;

    currNode.branches.forEach((b, idx) => {
      if (b.next !== null) {
        if (currId === nodeId && idx === branchIndex) return;

        if (!visited.has(b.next)) {
          visited.add(b.next);
          queue.push(b.next);
        }
      }
    });
  }

  return visited.size < state.nodes.length;
}

function updateBranch(nodeId, branchIndex, key, value) {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (node && node.branches[branchIndex]) {
    const processedValue =
      key === "next" ? (value === "null" ? null : Number(value)) : value;

    if (key === "next" && processedValue === null) {
      if (wouldSplitTree(nodeId, branchIndex)) {
        alert(
          "Prohibited Action: Cannot reset this path to '-- Choose Target --' because doing so splits the flow and isolates downstream nodes.",
        );
        render();
        openDrawer(nodeId);
        return;
      }
    }

    node.branches[branchIndex][key] = processedValue;
    calculateAutoTreeLayout();
    render();
    openDrawer(nodeId);
  }
}

function updateNodeName(nodeId, newName) {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (node) {
    node.name = newName;
    const cardTitle = document.querySelector(
      `[data-card-id="${nodeId}"] .node-text-label`,
    );
    if (cardTitle) {
      cardTitle.textContent = newName || `Node ${node.id}`;
    }
    updateJSONPreview();
  }
}

function updateMetadata(nodeId, value) {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (node) {
    node.metadata = value;
    updateJSONPreview();
  }
}

function updateJSONPreview() {
  const formattedScript = {};

  state.nodes.forEach((node) => {
    formattedScript[node.id] = {
      name: node.name,
      conditionalRoutes: node.branches.reduce((acc, b) => {
        if (b.next !== null) acc[b.conditionValue] = b.next;
        return acc;
      }, {}),
      metadata: node.metadata || "",
    };
  });

  jsonPreview.textContent = JSON.stringify(formattedScript, null, 2);
}

function openDrawer(nodeId) {
  activeNodeId = nodeId;
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return;

  drawerTitle.textContent = `Configure Node: ${node.id}`;
  drawerBody.innerHTML = "";

  let branchesHTML = "";
  node.branches.forEach((branch, idx) => {
    // Check if unassigning or deleting this specific branch splits the tree
    const causesSplit = wouldSplitTree(node.id, idx);

    // Disable the '-- Choose Target --' option if unassigning splits the tree
    let options = `<option value="null" ${branch.next === null ? "selected" : ""} ${causesSplit ? "disabled" : ""}>-- Choose Target --</option>`;

    state.nodes.forEach((target) => {
      if (target.id !== node.id) {
        options += `<option value="${target.id}" ${branch.next === target.id ? "selected" : ""}>${target.name || "Node " + target.id}</option>`;
      }
    });

    // If deleting this path splits the tree, we disable the button and add a warning title
    const deleteDisabledAttr = causesSplit
      ? "disabled title='Cannot delete: unlinking isolates downstream nodes'"
      : "title='Remove Path'";

    branchesHTML += `
      <div class="branch-row" data-index="${idx}">
        <input type="text" class="branch-cond" value="${branch.conditionValue}" placeholder="Value">
        <select class="branch-target">${options}</select>
        <button class="delete-branch-btn" ${deleteDisabledAttr}>×</button>
      </div>
    `;
  });

  const isDeleteDisabled = hasChildNodes(node.id);

  drawerBody.innerHTML = `
    <div class="drawer-section node-meta-actions">
      <div>
        <label>Node Name / Label</label>
        <input type="text" id="node-name-input" value="${node.name || ""}" placeholder="Enter name...">
      </div>
      
      <div class="node-control-actions-row">
        <button id="add-child-node-btn" class="btn action-sub-btn">+ Add Child Node</button>
        <button id="delete-node-sidebar-btn" class="btn icon-danger-btn" 
          ${isDeleteDisabled ? "disabled title='Cannot delete a node with active child connections'" : "title='Delete Node'"}>
          <span class="material-symbols-outlined icon-size">delete</span>
        </button>
      </div>
      ${isDeleteDisabled ? `<span class="disabled-warning-text">Cannot delete node while children are connected.</span>` : ""}
    </div>

    <div class="drawer-section">
      <div class="drawer-action-header">
         <label>Injected Javascript</label>
      </div>
      <div class="resizable-editor-wrapper">
        <div id="drawer-editor-container" class="editor-container"></div>
      </div>
    </div>
    
    <div class="branches-section">
      <div class="section-title">
        <label>Conditional Paths</label>
        <button class="add-branch-inner-btn">+ Add Path</button>
      </div>
      <div class="branches-list">${branchesHTML}</div>
    </div>
  `;

  if (activeEditorInstance) activeEditorInstance.dispose();

  const container = document.getElementById("drawer-editor-container");
  activeEditorInstance = monaco.editor.create(container, {
    value: node.metadata,
    language: "javascript",
    theme: "vs-dark",
    minimap: { enabled: false },
    automaticLayout: true,
    lineNumbers: "on",
    folding: false,
  });

  activeEditorInstance.onDidChangeModelContent(() => {
    updateMetadata(node.id, activeEditorInstance.getValue());
  });

  document.getElementById("node-name-input").addEventListener("input", (e) => {
    updateNodeName(node.id, e.target.value);
  });

  document
    .getElementById("add-child-node-btn")
    .addEventListener("click", () => {
      addChildNode(node.id);
    });

  if (!isDeleteDisabled) {
    document
      .getElementById("delete-node-sidebar-btn")
      .addEventListener("click", () => {
        if (
          confirm(`Are you sure you want to completely delete Node ${node.id}?`)
        ) {
          deleteNode(node.id);
        }
      });
  }

  drawerBody
    .querySelector(".add-branch-inner-btn")
    .addEventListener("click", () => addBranch(node.id));

  drawerBody.querySelectorAll(".branch-row").forEach((row) => {
    const idx = Number(row.getAttribute("data-index"));
    row
      .querySelector(".branch-cond")
      .addEventListener("change", (e) =>
        updateBranch(node.id, idx, "conditionValue", e.target.value),
      );
    row
      .querySelector(".branch-target")
      .addEventListener("change", (e) =>
        updateBranch(node.id, idx, "next", e.target.value),
      );

    // Only bind event listener if the delete button isn't disabled
    const delBtn = row.querySelector(".delete-branch-btn");
    if (!delBtn.hasAttribute("disabled")) {
      delBtn.addEventListener("click", () => {
        deleteBranch(node.id, idx);
      });
    }
  });

  editDrawer.classList.add("open");
  document
    .querySelectorAll(".node-card")
    .forEach((c) => c.classList.remove("selected"));
  const activeCard = document.querySelector(`[data-card-id="${node.id}"]`);
  if (activeCard) activeCard.classList.add("selected");
}

function closeDrawer() {
  editDrawer.classList.remove("open");
  activeNodeId = null;
  if (activeEditorInstance) {
    activeEditorInstance.dispose();
    activeEditorInstance = null;
  }
  document
    .querySelectorAll(".node-card")
    .forEach((c) => c.classList.remove("selected"));
}

function drawArrows() {
  canvas.width = workspace.scrollWidth;
  canvas.height = workspace.scrollHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const workspaceRect = workspace.getBoundingClientRect();

  const targetRegistry = {};
  state.nodes.forEach((node) => {
    node.branches.forEach((branch) => {
      if (branch.next !== null) {
        targetRegistry[branch.next] = (targetRegistry[branch.next] || 0) + 1;
      }
    });
  });

  const targetCurrentIndex = {};

  state.nodes.forEach((node, nodeIdx) => {
    const totalBranches = node.branches.filter((b) => b.next !== null).length;
    let explicitBranchIdx = 0;

    node.branches.forEach((branch) => {
      if (branch.next === null) return;

      const sourceCard = document.querySelector(`[data-card-id="${node.id}"]`);
      const targetCard = document.querySelector(
        `[data-card-id="${branch.next}"]`,
      );
      if (!sourceCard || !targetCard) return;

      const srcRect = sourceCard.getBoundingClientRect();
      const tgtRect = targetCard.getBoundingClientRect();

      const segmentSrc = srcRect.width / (totalBranches + 1);
      const startX =
        srcRect.left +
        segmentSrc * (explicitBranchIdx + 1) -
        workspaceRect.left +
        workspace.scrollLeft;
      const startY =
        srcRect.top + srcRect.height - workspaceRect.top + workspace.scrollTop;

      const totalInputs = targetRegistry[branch.next] || 1;
      const currentInputIdx = targetCurrentIndex[branch.next] || 0;
      targetCurrentIndex[branch.next] = currentInputIdx + 1;

      const segmentTgt = tgtRect.width / (totalInputs + 1);
      const endX =
        tgtRect.left +
        segmentTgt * (currentInputIdx + 1) -
        workspaceRect.left +
        workspace.scrollLeft;
      const endY = tgtRect.top - workspaceRect.top + workspace.scrollTop;

      ctx.beginPath();
      ctx.moveTo(startX, startY);

      const verticalDelta = endY - startY;
      const isBackwardsOrSameLevel = verticalDelta <= 40;

      if (isBackwardsOrSameLevel) {
        // Safe Loop: Find furthest right horizontal bound to sweep out past structures cleanly
        const sourceCardRightX =
          srcRect.right - workspaceRect.left + workspace.scrollLeft;
        const targetCardRightX =
          tgtRect.right - workspaceRect.left + workspace.scrollLeft;
        const furthestRight = Math.max(
          startX,
          endX,
          sourceCardRightX,
          targetCardRightX,
        );
        const rightBypassHighway = furthestRight + 40 + explicitBranchIdx * 15;

        const firstBreakY = startY + 20 + explicitBranchIdx * 6;
        const returnBreakY = endY - 20 - currentInputIdx * 6;

        ctx.lineTo(startX, firstBreakY);
        ctx.lineTo(rightBypassHighway, firstBreakY);
        ctx.lineTo(rightBypassHighway, returnBreakY);
        ctx.lineTo(endX, returnBreakY);
        ctx.lineTo(endX, endY);
      } else {
        const midY = startY + verticalDelta * 0.5 + explicitBranchIdx * 6;
        ctx.lineTo(startX, midY);
        ctx.lineTo(endX, midY);
        ctx.lineTo(endX, endY);
      }

      const colorPalette = [
        "#4f46e5",
        "#10b981",
        "#f59e0b",
        "#ec4899",
        "#06b6d4",
      ];
      ctx.strokeStyle =
        colorPalette[(explicitBranchIdx + nodeIdx) % colorPalette.length];
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = "#e4e4e7";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";

      const labelText = `${branch.conditionValue}`;
      const midPointX = startX + (endX - startX) * 0.5;
      const labelY = isBackwardsOrSameLevel
        ? startY + 16
        : startY + verticalDelta * 0.5 + explicitBranchIdx * 6 - 4;

      ctx.save();
      const textMetrics = ctx.measureText(labelText);
      ctx.fillStyle = "rgba(22, 22, 31, 0.95)";
      ctx.fillRect(
        midPointX - textMetrics.width / 2 - 4,
        labelY - 7,
        textMetrics.width + 8,
        14,
      );

      ctx.fillStyle = "#e4e4e7";
      ctx.fillText(labelText, midPointX, labelY + 4);
      ctx.restore();

      const arrowSize = 5;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - arrowSize, endY - arrowSize * 1.5);
      ctx.lineTo(endX + arrowSize, endY - arrowSize * 1.5);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();

      explicitBranchIdx++;
    });
  });
}

function render() {
  treeContainer.innerHTML = "";

  state.nodes.forEach((node) => {
    const card = document.createElement("div");
    card.className = "node-card";
    if (activeNodeId === node.id) card.classList.add("selected");

    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.setAttribute("data-card-id", node.id);

    card.innerHTML = `
      <div class="node-compact-title">
        <span class="material-symbols-outlined icon">account_tree</span>
        <span class="node-text-label">${node.name || "Node " + node.id}</span>
      </div>
    `;

    card.addEventListener("click", () => openDrawer(node.id));
    treeContainer.appendChild(card);
  });

  updateJSONPreview();
  setTimeout(drawArrows, 50);
}

init();

// JSON Storage Controls
document.getElementById("upload-json-btn").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedScript = JSON.parse(event.target.result);
        state.nodes = Object.entries(importedScript).map(([id, node]) => ({
          id: Number(id),
          name: node.name || `Node Step ${id}`,
          metadata: node.metadata,
          branches: Object.entries(node.conditionalRoutes).map(
            ([conditionValue, next]) => ({ conditionValue, next }),
          ),
          x: 0,
          y: 0,
        }));
        state.nextIdCounter =
          Math.max(...state.nodes.map((n) => n.id)) + 1 || 1000;
        closeDrawer();
        calculateAutoTreeLayout();
        render();
      } catch (err) {
        alert("Failed to load script: Invalid JSON format.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

document.getElementById("download-json-btn").addEventListener("click", () => {
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(jsonPreview.textContent);
  const dlAnchor = document.createElement("a");
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", "script.json");
  document.body.appendChild(dlAnchor);
  dlAnchor.click();
  dlAnchor.remove();
});

document.getElementById("reset-json-btn").addEventListener("click", () => {
  if (confirm("Are you sure you want to reset the script workflow?")) {
    closeDrawer();
    state.nodes = JSON.parse(JSON.stringify(initial_state.nodes));
    state.nextIdCounter = initial_state.nextIdCounter;
    calculateAutoTreeLayout();
    render();
  }
});

document.getElementById("copy-json-btn").addEventListener("click", async () => {
  const copyIcon = document.getElementById("copyIcon");
  await navigator.clipboard.writeText(jsonPreview.textContent);
  copyIcon.textContent = "check"; // Material symbol for checkmark

  // Reset the button back to normal after 2 seconds
  setTimeout(() => {
    copyIcon.textContent = "content_copy";
  }, 2000);
});


  // const GITHUB_USER = PROCESS.ENV.GITHUB_USER || "punithashunmugam4";
  // const GITHUB_REPO = PROCESS.ENV.GITHUB_REPO || "bot-automation-trees";
  // const BRANCH = PROCESS.ENV.BRANCH || "main";
    const GITHUB_USER = "punithashunmugam4";
  const GITHUB_REPO = "bot-automation-trees";
  const BRANCH = "main";
  const baseUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${BRANCH}`;
  let bot_list=[]

  async function getGitHubToken() {
    // return window.prompt(
    //   "Enter a GitHub personal access token with repo contents write access to save this bot:",
    // );
    return _env.BOT_TREE_TOKEN || PROCESS.ENV.BOT_TREE_TOKEN;
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  async function saveScriptToGitHub(fileName, scriptText) {
    const token = await getGitHubToken();
    if (!token) {
      alert("A GitHub token is required to save the script to the cloud.");
      return;
    }

    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "script-generator",
    };

    let existingFile = null;
    try {
      const existingResponse = await fetch(`${url}?ref=${BRANCH}`, {
        method: "GET",
        headers,
      });

      if (existingResponse.status === 404) {
        console.info(`GitHub file ${fileName} does not exist yet. It will be created.`);
      } else if (existingResponse.ok) {
        existingFile = await existingResponse.json();
      } else {
        const errorBody = await existingResponse.json().catch(() => ({}));
        throw new Error(
          errorBody?.message || `GitHub lookup failed with status ${existingResponse.status}`,
        );
      }
    } catch (error) {
      if (error?.message?.includes("404")) {
        console.info(`GitHub file ${fileName} does not exist yet. It will be created.`);
      } else {
        console.warn("Could not read the existing GitHub file:", error);
      }
    }

    const body = {
      message: `Save ${fileName}`,
      content: encodeBase64(scriptText),
      branch: BRANCH,
    };

    if (existingFile?.sha) {
      body.sha = existingFile.sha;
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseBody?.message || `GitHub save failed with status ${response.status}`);
    }

    return responseBody;
  }

document.addEventListener("DOMContentLoaded", async() => {
  try {
    // 1. Fetch the manifest file from GitHub
    // const response = await axios.get(`${baseUrl}/manifest.json`);
    const response = await fetch(`${baseUrl}/manifest.json`).then((res) => res.json() );
    console.log(response)
    const manifest = response;
    console.log(manifest)
   bot_list=manifest?.bot_list || []
  } catch (error) {
    console.error("Error fetching manifest:", error);
  } 
  const botSelect = document.getElementById("bot-select");
  botSelect.innerHTML = '<option value="">-- Select a Bot --</option>';

  bot_list.forEach((bot) => {
    console.log(bot);
    const option = document.createElement("option");
    option.value = bot;
    option.textContent = bot.split(".")[0]; 
    botSelect.appendChild(option);
  }
   
);
const create = document.createElement("option");
    create.value = "create";
    create.textContent = "-- Create New Bot --";  
   botSelect.appendChild(create);
});

document.getElementById("bot-select").addEventListener("change", async(e) => {
  const selectedBot = e.target.value;
  if (selectedBot) {
    const botData = bot_list.find((bot) => bot === selectedBot);
    if (botData) {
      const script =await fetch(`${baseUrl}/${selectedBot}`).then((res) => res.json());
      console.log(script)
      state.nodes = Object.entries(script).map(([id, node]) => ({
        id: Number(id),
        name: node.name || `Node Step ${id}`,
        metadata: node.metadata,  
      branches: Object.entries(node.conditionalRoutes).map(
        ([conditionValue, next]) => ({ conditionValue, next }),
      ),
        x: 0,
        y: 0,
      }));    

      state.nextIdCounter =
        Math.max(...state.nodes.map((n) => n.id)) + 1 || 1000;
      closeDrawer();
      calculateAutoTreeLayout();
      render();
    }
    else if (selectedBot === "create") {
      const newBotName = prompt("Enter the name for the new bot (without extension):");
      if (newBotName) {
        const newBotFileName = `${newBotName}.json`;
        bot_list.push(newBotFileName);
        const botSelect = document.getElementById("bot-select");
        const newOption = document.createElement("option");
        newOption.value = newBotFileName;
        newOption.textContent = newBotName;
        botSelect.firstElementChild.insertAdjacentElement("afterend", newOption);
        botSelect.value = newBotFileName;
        console.log(default_state);
        state.nodes = default_state.nodes;
        state.nextIdCounter = 1000;
        closeDrawer();
        calculateAutoTreeLayout();
        render();
      }
    }

  }
});

document.getElementById("save-cloud-json-btn").addEventListener("click", async (e) => {
  const selectedBot = document.getElementById("bot-select").value;
  if (!selectedBot) {
    alert("No bot selected. Please select a bot to save the script.");
    return;
  }
else{
  try {
    const scriptText = jsonPreview.textContent.trim();
    if (!scriptText || scriptText === "{}") {
      alert("The script preview is empty. Build a workflow before saving.");
      return;
    }

    JSON.parse(scriptText);
    await saveScriptToGitHub(selectedBot, scriptText);
    alert(`Saved ${selectedBot} to GitHub successfully.`);
  } catch (error) {
    console.error("Failed to save script to GitHub:", error);
    alert(error.message || "Failed to save the script to GitHub.");
  }
}
});
