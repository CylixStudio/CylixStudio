# Development workflow

Future work starts in CylixStudio-Demo. Port a change to CylixStudio (Main) only after explicit approval.

Never port Demo's no-login auth, DemoUser, or Pro unlock into Main. Never copy secrets from either project.

Keep two projects: Demo and Main. Do not create a third full copy.

Do not deploy to production, and do not apply a production database migration, without a separate approval.
