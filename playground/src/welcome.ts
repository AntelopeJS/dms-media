import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { Form } from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";

@RegisterPage()
export class PlaygroundWelcomePage extends PageController("welcome", {
  displayName: "Welcome",
  description: "Standalone welcome page outside any module",
  icon: "i-ph-hand-waving",
  category: pagesCategory,
  order: 0,
}) {
  static content = Form({
    title: "$app.welcome.form_title",
    description: "$app.welcome.form_description",
    fieldsOrientation: "vertical",
    fields: [
      {
        id: "name",
        label: "$app.welcome.name_label",
        type: new DefaultDataTypes.StringType({
          placeholder: "$app.welcome.name_placeholder",
        }),
        required: true,
      },
      {
        id: "email",
        label: "$app.welcome.email_label",
        type: new DefaultDataTypes.EmailType({
          placeholder: "$app.welcome.email_placeholder",
        }),
        required: true,
      },
      {
        id: "message",
        label: "$app.welcome.message_label",
        type: new DefaultDataTypes.StringType({
          placeholder: "$app.welcome.message_placeholder",
          textarea: true,
          rows: 4,
        }),
        required: true,
      },
    ],
    successMessage: "$app.welcome.success",
  });
}
