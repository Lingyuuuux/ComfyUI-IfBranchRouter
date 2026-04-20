import json

try:
    from comfy_execution.graph import ExecutionBlocker
except Exception:
    class ExecutionBlocker:
        def __init__(self, message=None):
            self.message = message


MAX_BRANCHES = 32


def _parse_conditions(raw):
    if raw is None:
        return []

    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = [part.strip() for part in text.replace("\n", ",").split(",")]
    elif isinstance(raw, (list, tuple)):
        data = list(raw)
    else:
        data = [raw]

    result = []
    for item in data[:MAX_BRANCHES]:
        if item is None:
            continue
        result.append(str(item))
    return result


def _as_int(value):
    if isinstance(value, bool):
        return int(value), True
    if isinstance(value, int):
        return value, True
    if isinstance(value, float):
        if value.is_integer():
            return int(value), True
        return None, False

    text = str(value).strip()
    if not text:
        return None, False

    try:
        return int(text), True
    except ValueError:
        try:
            number = float(text)
        except ValueError:
            return None, False
        if number.is_integer():
            return int(number), True
        return None, False


def _as_string(value, trim, case_sensitive):
    text = str(value)
    if trim:
        text = text.strip()
    if not case_sensitive:
        text = text.casefold()
    return text


def _matches(condition, expected, compare_as, trim, case_sensitive):
    mode = (compare_as or "AUTO").upper()

    if mode == "INT":
        left, left_ok = _as_int(condition)
        right, right_ok = _as_int(expected)
        return left_ok and right_ok and left == right

    if mode == "STRING":
        return _as_string(condition, trim, case_sensitive) == _as_string(
            expected, trim, case_sensitive
        )

    left, left_ok = _as_int(condition)
    right, right_ok = _as_int(expected)
    if left_ok and right_ok:
        return left == right

    return _as_string(condition, trim, case_sensitive) == _as_string(
        expected, trim, case_sensitive
    )


class IfBranchRouter:
    CATEGORY = "logic/branch"
    FUNCTION = "route"
    RETURN_TYPES = ("*",) * (MAX_BRANCHES + 1)
    RETURN_NAMES = tuple([f"if_{index + 1}" for index in range(MAX_BRANCHES)] + ["otherwise"])

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "condition": (
                    "INT,STRING",
                    {
                        "forceInput": True,
                        "tooltip": "Value used by the if checks. INT and STRING values are supported.",
                    },
                ),
                "compare_as": (
                    ["AUTO", "INT", "STRING"],
                    {
                        "default": "AUTO",
                        "tooltip": "AUTO compares as INT when both sides are integer-like, otherwise as STRING.",
                    },
                ),
                "conditions_json": (
                    "STRING",
                    {
                        "default": '["0", "1"]',
                        "multiline": False,
                        "tooltip": "Stored by the UI. Without the UI, edit this as a JSON array such as [\"0\", \"1\"].",
                    },
                ),
                "string_trim": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "Trim spaces before STRING comparison.",
                    },
                ),
                "case_sensitive": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "When STRING comparison is used, match upper/lower case exactly.",
                    },
                ),
            },
            "optional": {
                "passthrough": (
                    "*",
                    {
                        "forceInput": True,
                        "tooltip": "Optional value to pass through the selected branch. If omitted, the condition value is output.",
                    },
                )
            },
        }

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True

    def route(
        self,
        condition,
        compare_as="AUTO",
        conditions_json='["0", "1"]',
        string_trim=False,
        case_sensitive=True,
        passthrough=None,
    ):
        conditions = _parse_conditions(conditions_json)
        selected = len(conditions)

        for index, expected in enumerate(conditions):
            if _matches(condition, expected, compare_as, string_trim, case_sensitive):
                selected = index
                break

        payload = condition if passthrough is None else passthrough
        outputs = [ExecutionBlocker(None) for _ in range(MAX_BRANCHES + 1)]
        outputs[selected] = payload
        return tuple(outputs)


NODE_CLASS_MAPPINGS = {
    "IfBranchRouter": IfBranchRouter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "IfBranchRouter": "If Branch Router",
}
