import { app } from "../../scripts/app.js";

const NODE_NAME = "IfBranchRouter";
const MAX_BRANCHES = 32;
const DYNAMIC_FLAG = "__ifBranchRouterDynamic";

function getWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

function hideWidget(widget) {
    if (!widget || widget.__ifBranchRouterHidden) {
        return;
    }

    widget.__ifBranchRouterHidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
}

function readConditions(node) {
    const widget = getWidget(node, "conditions_json");
    if (!widget) {
        return ["0", "1"];
    }

    try {
        const value = JSON.parse(widget.value || "[]");
        if (Array.isArray(value)) {
            return value.slice(0, MAX_BRANCHES).map((item) => String(item));
        }
    } catch (_) {
        return String(widget.value || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, MAX_BRANCHES);
    }

    return [];
}

function writeConditions(node, conditions) {
    const widget = getWidget(node, "conditions_json");
    if (!widget) {
        return;
    }

    widget.value = JSON.stringify(conditions.slice(0, MAX_BRANCHES));
}

function moveOutputLinks(node, fromSlot, toSlot) {
    if (!node.outputs?.[fromSlot] || !node.outputs?.[toSlot] || fromSlot === toSlot) {
        return;
    }

    const links = [...(node.outputs[fromSlot].links || [])];
    node.outputs[fromSlot].links = [];
    node.outputs[toSlot].links = node.outputs[toSlot].links || [];

    for (const linkId of links) {
        const link = node.graph?.links?.[linkId];
        if (link) {
            link.origin_slot = toSlot;
        }
        node.outputs[toSlot].links.push(linkId);
    }
}

function disconnectOutput(node, slot) {
    const links = [...(node.outputs?.[slot]?.links || [])];
    for (const linkId of links) {
        node.graph?.removeLink(linkId);
    }
}

function labelOutputs(node, conditions) {
    for (let index = 0; index < conditions.length; index += 1) {
        if (node.outputs?.[index]) {
            node.outputs[index].name = `if == ${conditions[index]}`;
            node.outputs[index].type = "*";
        }
    }

    const otherwiseSlot = conditions.length;
    if (node.outputs?.[otherwiseSlot]) {
        node.outputs[otherwiseSlot].name = "否则";
        node.outputs[otherwiseSlot].type = "*";
    }
}

function syncOutputCount(node, conditions) {
    const wanted = Math.max(1, conditions.length + 1);

    while ((node.outputs?.length || 0) < wanted) {
        node.addOutput("", "*");
    }

    while ((node.outputs?.length || 0) > wanted) {
        node.removeOutput(node.outputs.length - 1);
    }

    labelOutputs(node, conditions);
}

function rebuildConditionWidgets(node) {
    const oldWidgets = node.widgets || [];
    node.widgets = oldWidgets.filter((widget) => !widget[DYNAMIC_FLAG]);

    const conditions = readConditions(node);
    for (let index = 0; index < conditions.length; index += 1) {
        const widget = node.addWidget(
            "text",
            `if ${index + 1} ==`,
            conditions[index],
            (value) => {
                const current = readConditions(node);
                current[index] = String(value);
                writeConditions(node, current);
                labelOutputs(node, current);
                node.setDirtyCanvas(true, true);
            },
            {}
        );
        widget[DYNAMIC_FLAG] = true;
    }

    const addButton = node.addWidget("button", "添加 if 条件", null, () => {
        const current = readConditions(node);
        if (current.length >= MAX_BRANCHES) {
            return;
        }

        const oldOtherwiseSlot = current.length;
        current.push(String(current.length));
        writeConditions(node, current);

        node.addOutput("", "*");
        moveOutputLinks(node, oldOtherwiseSlot, current.length);
        labelOutputs(node, current);
        rebuildConditionWidgets(node);
        node.setSize(node.computeSize());
        node.setDirtyCanvas(true, true);
    });
    addButton[DYNAMIC_FLAG] = true;

    const removeButton = node.addWidget("button", "减少 if 条件", null, () => {
        const current = readConditions(node);
        if (current.length <= 0) {
            return;
        }

        const oldOtherwiseSlot = current.length;
        const removedConditionSlot = current.length - 1;
        current.pop();
        writeConditions(node, current);

        disconnectOutput(node, removedConditionSlot);
        moveOutputLinks(node, oldOtherwiseSlot, removedConditionSlot);
        node.removeOutput(oldOtherwiseSlot);
        labelOutputs(node, current);
        rebuildConditionWidgets(node);
        node.setSize(node.computeSize());
        node.setDirtyCanvas(true, true);
    });
    removeButton[DYNAMIC_FLAG] = true;
}

function setupNode(node) {
    hideWidget(getWidget(node, "conditions_json"));
    const conditions = readConditions(node);
    syncOutputCount(node, conditions);
    rebuildConditionWidgets(node);

    if (node.computeSize) {
        node.setSize(node.computeSize());
    }
}

app.registerExtension({
    name: "comfy.if_branch_router",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            setupNode(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            requestAnimationFrame(() => setupNode(this));
            return result;
        };
    },
});
