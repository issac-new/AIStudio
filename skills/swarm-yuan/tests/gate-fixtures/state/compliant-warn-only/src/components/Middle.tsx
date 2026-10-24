// 中间层组件（prop drilling 违例样本）：自身不使用 props，原样透传给 6 个子组件
interface PanelProps {
  title: string;
  user: string;
  theme: string;
}

export function Middle(props: PanelProps) {
  return (
    <section>
      <Header {...props} />
      <Sidebar {...props} />
      <Content {...props} />
      <Footer {...props} />
      <Toolbar {...props} />
      <StatusBar {...props} />
    </section>
  );
}
