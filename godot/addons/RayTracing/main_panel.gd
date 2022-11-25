@tool

extends Control


@onready var camera: FreeCamera3D = %FreeCamera3D
var initCameraTransform: Transform3D
var initCameraRotation: Vector3

var fixed_fps: int = 90
var fps: int = fixed_fps
var stretch_shrink: int = 3

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
    initCameraTransform = camera.transform
    initCameraRotation = camera.rotation
    
    _view_port_size_changed()
    get_viewport().size_changed.connect(_view_port_size_changed)
    
    %camera_aperture_s.value = %always_uniform_camera.aperture
    %camera_fov_s.value = camera.fov
    %camera_focus_s.value = %always_uniform_camera.focus
    %gamma_s.value = %always_uniform_camera.gamma
    %max_sample_s.value = %PostProcessShader.max_sample
    %light_quality_s.value = %always_uniform_camera.quality
    %fixed_fps_edit.text = str(fixed_fps)
    %resolution_s.value = stretch_shrink

func _view_port_size_changed():
    var viewport_rect = get_viewport_rect()
    var min = min(viewport_rect.size.x, viewport_rect.size.y)
    %resolution_s.max_value = float(min)
    
    if stretch_shrink > min:
        %resolution_s.value = min

func _fixed_fps() -> void:
    var delta_fps := fps - fixed_fps
    
    var base = %light_quality_s.value
    
    if delta_fps >= 0:  base += 0.01
    elif delta_fps < 4: base -= min(base*0.01, 0.001)
    
    %light_quality_s.value = base

func _process(delta: float) -> void:
    fps = Performance.get_monitor(Performance.TIME_FPS)
    %fps.text = str(fps)
    %sample.text = str(%PostProcessShader.frame)
    if is_instance_valid(camera):
        %camera_speed.text = str(camera.max_speed)
        %camera_speed_s.value = camera.max_speed
    
    if (%fixed_fps_switch as CheckButton).button_pressed:
        _fixed_fps()

func _on_camera_aperture_s_value_changed(value: float) -> void:
    %always_uniform_camera.aperture = value
    %camera_aperture.text = str(value)
    %PostProcessShader.frame = 0

func _on_camera_focus_s_value_changed(value: float) -> void:
    %always_uniform_camera.focus = value
    %camera_focus.text = str(value)
    %PostProcessShader.frame = 0

func _on_camera_fov_s_value_changed(value: float) -> void:
    %always_uniform_camera.vfov = value
    %camera_fov.text = str(value)
    %PostProcessShader.frame = 0

func _on_gamma_s_value_changed(value: float) -> void:
    %always_uniform_camera.gamma = value
    %gamma.text = str(value)
    %PostProcessShader.frame = 0

func _on_max_sample_s_value_changed(value: float) -> void:
    %PostProcessShader.max_sample = int(value)
    %max_sample.text = str(value)

func _on_light_quality_s_value_changed(value: float) -> void:
    %always_uniform_camera.quality = value
    %light_quality.text = str(value)
    %PostProcessShader.frame = 0

func _on_fixed_fps_edit_text_changed(text: String) -> void:
    var value: int = clampi(abs(int(text)), 1, 360)
    var str_value = str(value)
    if str_value != text:
        %fixed_fps_edit.text = str_value

func _on_fixed_fps_switch_toggled(button_pressed: bool) -> void:
    (%fixed_fps_switch as CheckButton).text = "ON" if button_pressed else "OFF"

func _on_rest_camera_b_pressed() -> void:
    camera.transform = initCameraTransform
    camera.reset_rotation(initCameraRotation)
    %PostProcessShader.frame = 0

func _on_sample_once_b_pressed() -> void:
    %PostProcessShader.frame = 0

func _on_camera_speed_s_value_changed(value: float) -> void:
    camera.max_speed = value


func _on_resolution_s_value_changed(value: float) -> void:
    stretch_shrink = int(value)
    %resolution.text = "1/" + str(stretch_shrink)
    (%RayTracing as SubViewportContainer).stretch_shrink = stretch_shrink
    (%PostProcess as SubViewportContainer).stretch_shrink = stretch_shrink
    (%Denoise as SubViewportContainer).stretch_shrink = stretch_shrink
