declare module 'expo-task-manager' {
  export type TaskManagerTaskBody<Data = any> = {
    data?: Data;
    error?: any;
  };

  export function defineTask(
    taskName: string,
    task: (body: TaskManagerTaskBody) => void | Promise<void>
  ): void;

  export function isTaskRegisteredAsync(taskName: string): Promise<boolean>;
}
