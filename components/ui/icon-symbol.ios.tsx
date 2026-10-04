import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  calendar: "calendar-month",
  "event-note": "event-note",
  "notifications-none": "notifications-none",
  schedule: "schedule",
  add: "add",
  check: "check",
  close: "close",
  "chevron-left": "chevron-left",
  "chevron-right": "chevron-right",
  "lightbulb-outline": "lightbulb-outline",
  "more-horiz": "more-horiz",
} as const satisfies Record<string, ComponentProps<typeof MaterialIcons>["name"]>;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
