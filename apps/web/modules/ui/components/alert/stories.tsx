import { Meta, StoryObj } from "@storybook/react-vite";
import { LightbulbIcon } from "lucide-react";
import type * as React from "react";
import { Alert, AlertButton, AlertDescription, AlertTitle } from "./index";

// We'll define the story options separately from the component props
interface StoryOptions {
  title: string;
  description: string;
  showIcon: boolean;
  showButton: boolean;
  actionButtonText: string;
}

type StoryProps = React.ComponentProps<typeof Alert> & StoryOptions;

const meta: Meta<StoryProps> = {
  title: "UI/Alert",
  component: Alert,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    controls: { sort: "alpha", exclude: [] },
    docs: {
      description: {
        component:
          "The **Alert** component displays important messages to users with various styles and optional actions. It supports different variants for different message types and can include icons and buttons.",
      },
    },
  },
  // These argTypes are for story controls, not component props
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "error", "warning", "info", "success"],
      description: "Style variant of the alert",
      table: {
        category: "Appearance",
        type: { summary: "string" },
        defaultValue: { summary: "default" },
      },
      order: 1,
    },
    size: {
      control: "select",
      options: ["default", "small"],
      description: "Size of the alert component",
      table: {
        category: "Appearance",
        type: { summary: "string" },
        defaultValue: { summary: "default" },
      },
      order: 2,
    },
    showIcon: {
      control: "boolean",
      description: "Whether to show an icon",
      table: {
        category: "Appearance",
        type: { summary: "boolean" },
      },
      order: 3,
    },
    showButton: {
      control: "boolean",
      description: "Whether to show action buttons",
      table: {
        category: "Behavior",
        type: { summary: "boolean" },
      },
      order: 1,
    },
    title: {
      control: "text",
      description: "Alert title text",
      table: {
        category: "Content",
        type: { summary: "string" },
      },
      order: 1,
    },
    description: {
      control: "text",
      description: "Alert description text",
      table: {
        category: "Content",
        type: { summary: "string" },
      },
      order: 2,
    },
    actionButtonText: {
      control: "text",
      description: "Text for the action button",
      table: {
        category: "Content",
        type: { summary: "string" },
      },
      order: 3,
    },
  },
};

export default meta;

// Our story type just specifies Alert props plus our story options
type Story = StoryObj<typeof Alert> & { args: StoryOptions };

// Create a common render function to reduce duplication
const renderAlert = (args: StoryProps) => {
  // Extract component props
  const { variant = "default", size = "default", className = "" } = args;

  // Extract story content options
  const {
    title = "",
    description = "",
    showIcon = false,
    showButton = false,
    actionButtonText = "",
  } = args as StoryOptions;

  return (
    <Alert variant={variant} size={size} className={className}>
      {showIcon && <LightbulbIcon />}
      <AlertTitle className={showIcon ? "pl-7" : ""}>{title}</AlertTitle>
      {description && <AlertDescription className={showIcon ? "pl-7" : ""}>{description}</AlertDescription>}
      {showButton && <AlertButton onClick={() => alert("Button clicked")}>{actionButtonText}</AlertButton>}
    </Alert>
  );
};

// Basic example with direct props
export const Default: Story = {
  render: renderAlert,
  args: {
    variant: "default",
    showIcon: false,
    showButton: false,
    title: "Alert Title",
    description: "This is an important notification.",
    actionButtonText: "Learn more",
  },
};

// Small size example
export const Small: Story = {
  render: renderAlert,
  args: {
    variant: "default",
    size: "small",
    title: "Information Alert",
    description: "This is an important notification.",
    showIcon: false,
    showButton: true,
    actionButtonText: "Learn more",
  },
  parameters: {
    docs: {
      description: {
        story: "Use if space is limited or the alert is not the main focus.",
      },
    },
  },
};

// With custom icon
export const WithButtonAndIcon: Story = {
  render: renderAlert,
  args: {
    variant: "default",
    title: "Alert Title",
    description: "This is an important notification.",
    showIcon: true,
    showButton: true,
    actionButtonText: "Learn more",
  },
  parameters: {
    docs: {
      description: {
        story: "Use when you need both visual emphasis and actionable content.",
      },
    },
  },
};

// Error variant
export const Destructive: Story = {
  render: renderAlert,
  args: {
    variant: "error",
    title: "Error Alert",
    description: "Your session has expired. Please log in again.",
    showIcon: false,
    showButton: true,
    actionButtonText: "Log in",
  },
  parameters: {
    docs: {
      description: {
        story: "Use for critical errors that need immediate attention or action.",
      },
    },
  },
};

// Warning variant
export const Warning: Story = {
  render: renderAlert,
  args: {
    variant: "warning",
    title: "Warning Alert",
    description: "You are editing sensitive data. Be cautious",
    showIcon: false,
    showButton: true,
    actionButtonText: "Proceed",
  },
  parameters: {
    docs: {
      description: {
        story: "Use to make the user aware of potential issues or risks.",
      },
    },
  },
};

// Info variant
export const Info: Story = {
  render: renderAlert,
  args: {
    variant: "info",
    title: "Info Alert",
    description: "There was an update to your application.",
    showIcon: false,
    showButton: true,
    actionButtonText: "Refresh",
  },
  parameters: {
    docs: {
      description: {
        story: "Use to give contextual information and support the user.",
      },
    },
  },
};

// Success variant
export const Success: Story = {
  render: renderAlert,
  args: {
    variant: "success",
    title: "Success Alert",
    description: "This worked! Please proceed.",
    showIcon: false,
    showButton: true,
    actionButtonText: "Close",
  },
  parameters: {
    docs: {
      description: {
        story: "Use to give positive feedback and confirm successful actions.",
      },
    },
  },
};

export const WithIcon: Story = {
  render: renderAlert,
  args: {
    variant: "info",
    title: "Information",
    description: "This alert has an icon for better visual hierarchy.",
    showIcon: true,
    showButton: false,
    actionButtonText: "",
  },
  parameters: {
    docs: {
      description: {
        story: "Use icons to improve visual hierarchy and message clarity.",
      },
    },
  },
};

export const LongContent: Story = {
  render: renderAlert,
  args: {
    variant: "warning",
    title: "Long Alert Title That Might Wrap to Multiple Lines",
    description:
      "This is a very long alert description that demonstrates how the alert component handles longer content. It should wrap gracefully and maintain proper spacing and readability even with extensive text content.",
    showIcon: true,
    showButton: true,
    actionButtonText: "Acknowledge",
  },
  parameters: {
    docs: {
      description: {
        story: "Shows how the alert handles longer content with proper text wrapping.",
      },
    },
  },
};
