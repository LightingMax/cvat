# CVAT Minus

我维护这个 fork，是因为在视频上标动作时，我需要回答两个问题：这个动作从哪一帧开始、在哪一帧结束？网络断了，刚才改过的标注还能不能找回来？

CVAT 提供了标注工具、数据模型、权限系统和部署环境。
我的工作是在这个基础上补上自己日常需要的功能。
等待上游讨论、评审和发布的时间，有时比我的项目能等的时间长，所以我先在这里维护能用的版本，再把适合通用场景的改动单独提交给上游。
名字里的 **Minus** 表示我承担的维护范围很小。
每次升级都会写明对应的 CVAT 版本，方便大家决定是否跟进。

CVAT Minus is an independent fork of CVAT Community maintained by LightingMax.
It adds a video action timeline and recoverable annotation saves.
The current base is **CVAT v2.84.0**, commit `a2faa79245d1`.
CVAT and its original contributors retain credit for the upstream software.
[Upstream release](https://github.com/cvat-ai/cvat/releases/tag/v2.84.0) · [License](LICENSE)

LightingMax maintains the Simplified Chinese interface. To request another language or volunteer to translate a module,
[open an issue](https://github.com/LightingMax/cvat/issues).

## 和上游相比，多了什么？

| 场景 | CVAT Minus 的做法 |
| --- | --- |
| 给一段视频标动作 | 在 **Video understanding** 工作区，每个动作单独占一条轨道。按 **M** 标记起止，多个动作可以重叠。可以拖动边界逐帧修正，也可以将动作区间导出为 JSON。 |
| 同一个动作已经有单帧 Tag | 输入 `n_positioning`，轨道就显示这个名字。项目里新增的区间标签叫 `n_positioning [interval]`，原 Tag 和它的单帧标注继续保留。 |
| 点击 Save 时网络断开 | 客户端先把这次提交保存在浏览器的 IndexedDB，再发送到服务器。用同一浏览器配置和账号回到原站点、原任务，可以恢复草稿并重试。清理站点数据会删除本地副本。 |
| 两个人改了同一个 Job | 保存前比较草稿、原始版本和当前服务器版本。能合并的改动一起提交，有冲突的交给标注者审阅。服务器识别重复提交，避免因响应丢失而重复创建标注。 |

在时间轴上看到的是包含首尾帧的范围。比如第 2 至 7 帧导出为 `start_frame=2, end_frame=7`，对应 CVAT API 的 `start=2, stop=8`。浏览器里的草稿要等服务器确认后才算提交成功。

## 界面语言与外观

登录页和主导航右侧的地球图标可以切换 **English / 简体中文**，也可以选择浅色、深色或跟随系统。首次访问时，界面参考浏览器语言和系统外观。用户的选择保存在当前浏览器。
切换语言会重新载入页面，标注过程中请先保存。项目名、标签名和标注内容由项目成员定义，导出时使用原值。

简体中文由 CVAT Minus 维护者 **LightingMax** 维护。欢迎为其他语言提 Issue，请注明语言、地区以及愿意参与翻译或校对的模块。也欢迎提交具体界面的术语改进。[语言需求与译文反馈](https://github.com/LightingMax/cvat/issues)

界面文案使用 i18next。修改组件中的英文原文后，可在仓库根目录提取和检查译文。

```sh
yarn workspace cvat-ui i18n:extract
# 编辑 cvat-ui/src/i18n/locales/zh-CN.json
yarn workspace cvat-ui i18n:check
```

提取命令保留已有译文，为新文案留下空值，并清理已移除的文案。检查命令会报告漏译、过期条目和不匹配的插值变量。请保留 `{{username}}` 等变量名，并按目标语言的语序组织整句话。
在视频理解工作台中，时间轴上的动作使用“轨道”，“轨迹”用于随帧变化的对象，“帧标记”对应单帧 Tag。

## 启动 CVAT Minus

准备 Git、Docker Engine 和带有 `!reset` 支持的 Docker Compose v2.24.4 或更新版本。
下面的命令从源码构建本 fork 的前端和服务端，使用独立的 `cvat_minus` Compose 项目、网络和数据卷，默认入口为本机 8091。

```sh
git clone --branch minus https://github.com/LightingMax/cvat.git cvat-minus
cd cvat-minus
./minus build cvat_server cvat_ui
./minus up -d --no-build --pull missing
./minus exec cvat_server python manage.py createsuperuser
```

打开 [本机 CVAT Minus](http://localhost:8091)，新建一个视频任务，进入 Job 后切到 **Video understanding**。
如需改端口，在运行命令前设置 `CVAT_MINUS_PORT`。
查看服务状态用 `./minus ps`，停止服务并保留卷用 `./minus stop`。

CI 在全新数据库上启动容器，用合成视频检查同名 Tag 与动作轨道、断网后恢复草稿、重复保存和版本冲突。
检查通过后，以同一 Git 提交号发布 Linux amd64 的 UI 与 server 镜像。
所有 worker 使用同一份 server 镜像。
GHCR 私有镜像需要先使用有读取权限的 GitHub 账号登录；公开仓库提供完整的源码构建入口。
若使用预构建镜像，选择一次**成功发布**的工作流运行，取其完整提交号，并在相同提交的检出目录执行以下命令。
[构建和发布记录](https://github.com/LightingMax/cvat/actions/workflows/minus-images.yml)

```sh
export CVAT_MINUS_REGISTRY=ghcr.io/lightingmax/cvat-minus
export CVAT_MINUS_TAG=sha-$(git rev-parse HEAD)
./minus pull
./minus up -d --no-build
```

## 我怎样跟进上游

GitHub Actions 每天生成一份只读巡检报告，列出上游最新稳定版、两份草案的评审情况，以及最近七天更新的相关 Issue。报告保存在每次运行的 Summary 中，也可以手动运行。[上游巡检记录](https://github.com/LightingMax/cvat/actions/workflows/minus-upstream.yml)

- **版本**：`minus` 是维护分支，按 CVAT Community 稳定版集成。
  日常关注上游 `develop` 的相关修复。
  发布新稳定版时，从 `minus` 拉更新分支，合入对应 tag，核对后端镜像基底、依赖、迁移编号和 Compose 变化，再运行同一套回归。
  README 的基线随实际合并更新。
- **Issue**：优先处理能在合成视频上复现的动作区间、标注保存和多人编辑问题。修复 PR 记录上游链接、复现步骤、受影响版本和验证结果。上游已合并相同修复时，验证通过后移除本地重复实现。欢迎在本 fork 提交问题。[CVAT Minus Issues](https://github.com/LightingMax/cvat/issues)
- **服务升级**：容器构建和标注服务部署是两个步骤。升级使用同一提交的 UI、server 和 worker。涉及数据库迁移时，先在数据副本演练，备份数据库、媒体和配置，再安排升级。回滚涉及数据库时使用与旧镜像匹配的备份。
- **上游讨论**：动作区间提案和键盘快捷键各自有独立的上游草案，可直接查看评审进展。
  [动作区间 PR](https://github.com/cvat-ai/cvat/pull/11492) · [键盘快捷键 PR](https://github.com/cvat-ai/cvat/pull/11493) ·
  [视频级标注讨论](https://github.com/cvat-ai/cvat/issues/4952)

## CVAT Community 原项目说明

下文保留上游项目介绍、文档与安装入口。安装 Minus 请使用上面的 `./minus` 命令。

[![CVAT Community header](site/content/en/images/cvat_github_header.webp)](https://app.cvat.ai)
# CVAT: Computer Vision Annotation Tool

[![Release][release-img]][release-url]
[![GitHub stars][stars-img]][stars-url]
[![License][license-img]][license-url]
[![CI][ci-img]][ci-url]
[![server pulls][docker-server-pulls-img]][docker-server-image-url]
[![ui pulls][docker-ui-pulls-img]][docker-ui-image-url]
[![CVAT Online][online-img]][online-url]
[![CVAT Enterprise][enterprise-img]][enterprise-url]
[![Status][status-img]][status-url]
[![Discord][discord-img]][discord-url]
[![Docs][docs-img]][docs-url]

[Website](https://www.cvat.ai/) ·
[Docs](https://docs.cvat.ai/docs/) ·
[Changelog](https://www.cvat.ai/resources/changelog) ·
[Tutorials](https://www.cvat.ai/resources/videos) ·
[Academy](https://www.cvat.ai/resources/academy) ·
[Blog](https://www.cvat.ai/resources/blog)

## What is CVAT Community?

**CVAT Community** is the free, self-hosted open-source edition of [CVAT](https://www.cvat.ai/) — one of
the most widely used platforms for image, video, audio, and 3D annotation.
Since 2018, CVAT has become one of the best-known data annotation tools in computer vision, with a
large open-source community, millions of Docker pulls, and broad adoption across research and
production AI teams.

CVAT Community supports image, video, audio, and 3D annotation, dataset management, team collaboration, cloud storage
integration, developer-friendly SDKs and APIs, and gives your team full control over your data
and annotation infrastructure.
The platform serves as the foundation of
[CVAT Online](https://www.cvat.ai/cvat-online) and
[CVAT Enterprise](https://www.cvat.ai/enterprise), and is actively maintained by the CVAT engineering team.

Why teams choose CVAT Community:

- **Own your data:** Run entirely within your own infrastructure. No data leaves your environment.
- **AI-powered annotation:** Connect your own ML models for detection, segmentation, and tracking to speed up labeling.
- **Team collaboration:** Multi-user and multi-organization support with roles, task assignments,
  and review workflows.
- **MIT-licensed core:** Use, modify, and distribute CVAT Community under the permissive MIT License. Some serverless
assets and dependencies may have separate licenses.
- **Production-grade:** The foundation of all CVAT commercial products — battle-tested at scale.
- **True open-source:** Transparent development, active community, on GitHub since 2018.

This repository contains the source code and deployment assets for CVAT Community.

For a fully managed setup, annotation services, or enterprise features, see
[CVAT Online](https://www.cvat.ai/cvat-online),
[CVAT Enterprise](https://www.cvat.ai/enterprise) and
[CVAT Labeling Services](https://www.cvat.ai/annotation-services).

## Getting Started

> 💡 Want to explore CVAT before deploying anything?
> **[Try CVAT Online (Free plan)](https://app.cvat.ai)** directly in your browser.
> Feature availability and usage limits vary by plan; see
> [CVAT Online pricing](https://www.cvat.ai/pricing/cvat-online) for details.

### Installation

**Prerequisites:**

- [Docker Engine](https://docs.docker.com/engine/install/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Git](https://git-scm.com/)

> 💡 CVAT is primarily tested with Chromium-based browsers (Google Chrome, Microsoft Edge).
> Firefox may work with some caveats; Safari/WebKit is not supported.

**1. Start the default stack**

Clone the repository and launch the services.

```bash
git clone https://github.com/cvat-ai/cvat
cd cvat

# Optional: set your IP or domain
# export CVAT_HOST=your-ip-or-domain

docker compose up -d
```

**2. Create an admin account**

```bash
docker exec -it cvat_server bash -ic 'python3 ~/manage.py createsuperuser'
```

See the [Installation Guide](https://docs.cvat.ai/docs/administration/community/basics/installation/) for full
instructions and OS-specific setup.

**3. Sign in and start labeling**

- Open [http://localhost:8080](http://localhost:8080) (or your `CVAT_HOST`) in your browser.
- Log in with your superuser account.
- Create a project or task, upload your data (images, videos, audio files, or point clouds),
and define labels to start annotating.

Learn more about annotation tools and workflows in the [CVAT Documentation](https://docs.cvat.ai/docs/) or
take our free course – [CVAT Academy](https://www.cvat.ai/resources/academy).

_For alternative deployments (AWS, Kubernetes, external PostgreSQL, backups, upgrades), see the [Deployment Guides](https://docs.cvat.ai/docs/administration/community/advanced/)._

## Key Capabilities

- **[Manual & Auto-labeling](https://docs.cvat.ai/docs/annotation/manual-annotation/):** Annotate images, videos, audio,
 and 3D point clouds with bounding boxes, polygons, masks, keypoints, cuboids, tags, intervals and more.
Speed up labeling by connecting your own models for automatic annotation.
- **[Task Management](https://docs.cvat.ai/docs/workspace/):** Organize datasets into projects, split them into tasks
  and jobs, assign work to annotators, and track progress in real time.
- **[Collaboration](https://docs.cvat.ai/docs/account_management/user-roles/):** Create organizations, invite teammates,
  assign roles, and collaborate on annotations with comments and issues.
- **[Quality Control](https://docs.cvat.ai/docs/qa-analytics/manual-qa/):** Review annotations, flag issues, compare
  results across annotators with consensus, and run Ground Truth and Honeypot checks through the server API.
- **[Analytics](https://docs.cvat.ai/docs/administration/community/advanced/analytics/):** Monitor user activity,
  working time by job, events, and server logs with Grafana dashboards.
- **[Data Ops & Integrations](https://docs.cvat.ai/docs/dataset_management/export-datasets/):** Export/import in 20+
  formats (COCO, YOLO, Pascal VOC, KITTI, etc.), connect to cloud storage (S3, Azure, Google Cloud), and automate
  via REST API and Python SDK.

Advanced capabilities such as advanced project analytics, quality control UI, built-in auto-labeling with SAM 2
 and SAM 3, AI agents, SSO, and more are available in [CVAT Online](https://www.cvat.ai/pricing/cvat-online)
 paid plans (Solo, Team) and [CVAT Enterprise](https://www.cvat.ai/enterprise).

## Developer Tools

CVAT is designed for automation. Beyond the Web UI, you can integrate it into your pipelines using:

- [Python SDK](https://docs.cvat.ai/docs/api_sdk/sdk/): install with `pip install cvat-sdk` and automate task creation,
uploads, and exports from Python.
- [Command line tool](https://docs.cvat.ai/docs/api_sdk/cli/): install with `pip install cvat-cli`
and script common CVAT workflows from the terminal.
- [REST API](https://docs.cvat.ai/docs/api_sdk/api/): full programmatic control over CVAT.

## Data and Formats

CVAT Community supports image, video, audio, and 3D (point cloud) annotation workflows. You can move data in and out
using 20+ supported formats: CVAT (XML), COCO (JSON), YOLO (TXT), Ultralytics YOLO (TXT/YAML), Pascal VOC (XML),
KITTI (TXT), MOT (TXT), Generic TSV (TSV), and more.

[Full list of supported formats.](https://docs.cvat.ai/docs/dataset_management/formats/)

## ML and AI Models

CVAT Community supports automatic annotation via pre-built serverless models powered by Nuclio,
covering detection, segmentation, pose estimation, and tracking:

| Model | Framework | Type |
| --- | --- | --- |
| [Segment Anything (SAM)](https://github.com/cvat-ai/cvat/tree/develop/serverless/pytorch/facebookresearch/sam/nuclio) | PyTorch | Interactor |
| [Inside-Outside Guidance (IOG)](https://github.com/cvat-ai/cvat/tree/develop/serverless/pytorch/shiyinzhang/iog/nuclio) | PyTorch | Interactor |
| [RetinaNet R101](https://github.com/cvat-ai/cvat/tree/develop/serverless/pytorch/facebookresearch/detectron2/retinanet_r101/nuclio) | PyTorch | Detector |
| [HRNet32 Whole Body Pose](https://github.com/cvat-ai/cvat/tree/develop/serverless/pytorch/mmpose/hrnet32/nuclio) | PyTorch | Pose Estimation |
| [TransT](https://github.com/cvat-ai/cvat/tree/develop/serverless/pytorch/dschoerk/transt/nuclio) | PyTorch | Tracker |
| [YOLO v7](https://github.com/cvat-ai/cvat/tree/develop/serverless/onnx/WongKinYiu/yolov7/nuclio) | ONNX | Detector |
| [Mask RCNN Inception ResNet v2](https://github.com/cvat-ai/cvat/tree/develop/serverless/openvino/omz/public/mask_rcnn_inception_resnet_v2_atrous_coco/nuclio) | OpenVINO | Detector |
| [Face Detection 0205](https://github.com/cvat-ai/cvat/tree/develop/serverless/openvino/omz/intel/face-detection-0205/nuclio) | OpenVINO | Detector |
| [Faster RCNN Inception v2](https://github.com/cvat-ai/cvat/tree/develop/serverless/tensorflow/faster_rcnn_inception_v2_coco/nuclio) | TensorFlow | Detector |

To enable automatic annotation, add the serverless component to your deployment:

```bash
docker compose -f docker-compose.yml -f components/serverless/docker-compose.serverless.yml up -d
```

This starts the serverless infrastructure. To make models available in CVAT, install `nuctl` and deploy
the functions you need, for example SAM or YOLO, as described in the [Automatic Annotation Guide](https://docs.cvat.ai/docs/annotation/auto-annotation/automatic-annotation/).

## Which CVAT edition should I choose?

- **CVAT Online**: the fastest way to try CVAT and start labeling without deployment. Use it to evaluate CVAT in
the browser, explore managed features, and move to cost-efficient paid plans when you need more capacity or team
workflows.
- **CVAT Community**: the MIT-licensed self-hosted edition for teams that want to run CVAT themselves, customize the
stack, and control their infrastructure.
- **CVAT Enterprise**: for organizations that need CVAT in their own cloud or internal environment, enterprise support,
security controls such as SSO, paid platform features, and SLAs.
- **Labeling Services**: for teams that want to outsource annotation work to CVAT.ai’s experienced labeling team instead
of building an internal labeling operation. Customers get trial access to CVAT Online during the project.

For detailed plan limits and feature availability, see [CVAT Online pricing](https://www.cvat.ai/pricing/cvat-online),
 [CVAT Enterprise](https://www.cvat.ai/enterprise), and [Labeling Services](https://www.cvat.ai/annotation-services).

## Support

- **Usage questions:** ask the community on [Discord](https://discord.com/invite/fNR3eXfk6C) or
Stack Overflow with the `cvat` tag.
- **Bugs and feature requests:** use [GitHub Issues](https://github.com/cvat-ai/cvat/issues).
- **FAQ:** [Installation, upgrades, troubleshooting](https://docs.cvat.ai/docs/faq/).

For dedicated support, SLAs, or advanced deployments, consider [CVAT Enterprise](https://www.cvat.ai/enterprise).

## Contributing

We welcome all contributions: bug reports, documentation fixes, integrations, and code.

- If you'd like to contribute to CVAT, please refer to our
  [contribution documentation](https://docs.cvat.ai/docs/contributing/).
- For bug reports or feature requests, please use the [GitHub Issues](https://github.com/cvat-ai/cvat/issues) tracker.

## Security

- Please review our [Security Policy](https://github.com/cvat-ai/cvat/security/policy) before reporting vulnerabilities.
- For sensitive issues, contact: [secure@cvat.ai](mailto:secure@cvat.ai).

## License

CVAT Community is released under the MIT License.

- Code in `/serverless` is also MIT-licensed, but may use third-party assets under separate licenses (including
  non-commercial). Review those licenses before use.
- This software uses FFmpeg libraries under LGPL/GPL. See the Dockerfile and
  [FFmpeg legal info](https://www.ffmpeg.org/legal.html) for details.

## Additional Resources

For the latest product releases, feature walkthroughs, and all things CVAT see:

<table cellspacing="10" border="0"><tr>
  <td><a href="https://www.cvat.ai/resources/blog"><img src="site/content/en/images/badge-blog.png" alt="CVAT Blog" height="120"/></a></td>
  <td><a href="https://www.cvat.ai/resources/academy"><img src="site/content/en/images/badge-academy.png" alt="CVAT Academy" height="120"/></a></td>
  <td><a href="https://www.cvat.ai/resources/case-studies"><img src="site/content/en/images/badge-case-studies.png" alt="Case Studies" height="120"/></a></td>
  <td><a href="https://www.youtube.com/@cvat-ai"><img src="site/content/en/images/badge-youtube.png" alt="YouTube" height="120"/></a></td>
  <td><a href="https://www.linkedin.com/company/cvat-ai"><img src="site/content/en/images/badge-linkedin.png" alt="LinkedIn" height="120"/></a></td>
</tr></table>

  <!-- Badges -->

[ci-img]: https://github.com/cvat-ai/cvat/actions/workflows/main.yml/badge.svg?branch=develop
[ci-url]: https://github.com/cvat-ai/cvat/actions

[docs-img]: https://img.shields.io/badge/docs-docs.cvat.ai-blue?style=flat-square
[docs-url]: https://docs.cvat.ai

[online-img]: https://img.shields.io/badge/CVAT%20Online-app.cvat.ai-success?style=flat-square
[online-url]: https://app.cvat.ai

[release-img]: https://img.shields.io/github/v/release/cvat-ai/cvat?style=flat-square
[release-url]: https://github.com/cvat-ai/cvat/releases

[license-img]: https://img.shields.io/github/license/cvat-ai/cvat?style=flat-square
[license-url]: https://github.com/cvat-ai/cvat/blob/develop/LICENSE

[stars-img]: https://img.shields.io/github/stars/cvat-ai/cvat?style=flat-square
[stars-url]: https://github.com/cvat-ai/cvat/stargazers

[status-img]: https://uptime.betterstack.com/status-badges/v2/monitor/1yl3h.svg
[status-url]: https://status.cvat.ai

[enterprise-img]: https://img.shields.io/badge/CVAT%20Enterprise-cvat.ai-orange?style=flat-square
[enterprise-url]: https://www.cvat.ai/enterprise

[docker-server-pulls-img]: https://img.shields.io/docker/pulls/cvat/server.svg?style=flat-square&label=server%20pulls
[docker-server-image-url]: https://hub.docker.com/r/cvat/server

[docker-ui-pulls-img]: https://img.shields.io/docker/pulls/cvat/ui.svg?style=flat-square&label=UI%20pulls
[docker-ui-image-url]: https://hub.docker.com/r/cvat/ui

[discord-img]: https://img.shields.io/discord/1000789942802337834?label=discord
[discord-url]: https://discord.gg/fNR3eXfk6C
